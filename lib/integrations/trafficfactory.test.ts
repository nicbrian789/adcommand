import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPersistTrafficFactoryBalance,
  createTrafficFactoryCampaign,
  deleteTrafficFactoryCampaigns,
  getTrafficFactoryAdvertiserAdTypes,
  getTrafficFactoryCampaign,
  getTrafficFactoryCategories,
  getTrafficFactoryCountryStats,
  getTrafficFactoryDailyStats,
  getTrafficFactorySessionToken,
  getTrafficFactoryUser,
  listTrafficFactoryCampaigns,
  loginTrafficFactory,
  mapTrafficFactoryCampaignStatus,
  isTrafficFactoryResultTotal,
  parseTrafficFactoryCountryStatRow,
  parseTrafficFactoryDailyStatRow,
  parseTrafficFactoryLoginResponse,
  parseTrafficFactorySessionToken,
  parseTrafficFactoryUser,
  pickFirstNumber,
  setTrafficFactoryCampaignsRunState,
  unwrapTrafficFactoryStatisticsPayload,
  updateTrafficFactoryCampaign,
  TF_BALANCE_KEYS,
  TF_IMPRESSION_KEYS,
  TF_SPEND_KEYS,
  type TfFetch,
} from "./trafficfactory";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const COUNTRY_FIXTURE = {
  result: [
    { id: 1, short_name: "United States", long_name: "United States of America", iso2: "US", iso3: "USA" },
    { id: 2, short_name: "Indonesia", long_name: "Republic of Indonesia", iso2: "ID", iso3: "IDN" },
  ],
};

describe("Traffic Factory auth (official login contract)", () => {
  it("parses official login body: token preferred over refresh_token", () => {
    const parsed = parseTrafficFactoryLoginResponse(
      JSON.stringify({ token: "access-abc", type: "Bearer", expires_in: 3600, refresh_token: "refresh-xyz" })
    );
    assert.equal(parsed.token, "access-abc");
    assert.equal(parsed.type, "Bearer");
    assert.equal(parsed.expiresIn, 3600);
    assert.equal(parsed.refreshToken, "refresh-xyz");
    assert.equal(
      parseTrafficFactorySessionToken(JSON.stringify({ refresh_token: "refresh-xyz", token: "access-abc" })),
      "access-abc"
    );
  });

  it("rejects missing access token even if refresh_token present", () => {
    assert.throws(
      () => parseTrafficFactoryLoginResponse(JSON.stringify({ refresh_token: "only-refresh", type: "Bearer" })),
      /Tidak menemukan token/
    );
  });

  it("sends api_token and uses returned token as session", async () => {
    let sawBearerPath = false;
    const fetchFn: TfFetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/login")) {
        assert.equal(init?.method, "POST");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.api_token, "api-key-test");
        return jsonResponse({ token: "access-from-login", type: "Bearer", expires_in: 7200, refresh_token: "refresh-should-not-be-used" });
      }
      if (url.endsWith("/user")) {
        sawBearerPath = true;
        const headerAuth =
          typeof init?.headers === "object" && init.headers && "Authorization" in (init.headers as object)
            ? (init.headers as Record<string, string>).Authorization
            : undefined;
        assert.equal(headerAuth, "Bearer access-from-login");
        return jsonResponse({ balance: 1, currency: "USD" });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    };

    const login = await loginTrafficFactory("api-key-test", fetchFn);
    assert.equal(login.token, "access-from-login");
    assert.notEqual(login.token, login.refreshToken);

    const session = await getTrafficFactorySessionToken("api-key-test", fetchFn);
    assert.equal(session, "access-from-login");
    await getTrafficFactoryUser(session, fetchFn);
    assert.equal(sawBearerPath, true);
  });

  it("rejects empty API token before calling network", async () => {
    let called = false;
    const fetchFn: TfFetch = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(() => loginTrafficFactory("  ", fetchFn), /kosong/);
    assert.equal(called, false);
  });

  it("maps 401/403 login failures clearly", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ error: "denied" }, 401);
    await assert.rejects(() => getTrafficFactorySessionToken("bad", fetchFn), /ditolak \(401\)/);
  });

  it("maps 401 on GET as expired/invalid session", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ error: "expired" }, 401);
    await assert.rejects(() => getTrafficFactoryUser("stale", fetchFn), /ditolak \(401\).*\/user/);
  });
});

describe("Traffic Factory /user + currency safety", () => {
  it("maps balance and currency from verified keys only", () => {
    const info = parseTrafficFactoryUser({ balance: 12.5, currency: "USD", value: 999, funds: 50 });
    assert.equal(info.balance, 12.5);
    assert.equal(info.currency, "USD");
    assert.equal(pickFirstNumber({ funds: 50, credit: 9 }, TF_BALANCE_KEYS), null);
  });

  it("reads nested user object", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ user: { account_balance: 3, currency_code: "EUR" } });
    const info = await getTrafficFactoryUser("session", fetchFn);
    assert.equal(info.balance, 3);
    assert.equal(info.currency, "EUR");
  });

  it("returns null balance when missing (unknown, not zero)", () => {
    const info = parseTrafficFactoryUser({ name: "x" });
    assert.equal(info.balance, null);
  });

  it("blocks persisting non-USD balance into USD UI field", () => {
    assert.equal(canPersistTrafficFactoryBalance(null), true);
    assert.equal(canPersistTrafficFactoryBalance("USD"), true);
    assert.equal(canPersistTrafficFactoryBalance("usd"), true);
    assert.equal(canPersistTrafficFactoryBalance("EUR"), false);
    assert.equal(canPersistTrafficFactoryBalance("IDR"), false);
  });
});

describe("Traffic Factory /campaigns", () => {
  it("maps statuses including booleans", () => {
    assert.equal(mapTrafficFactoryCampaignStatus("active"), "Running");
    assert.equal(mapTrafficFactoryCampaignStatus("paused"), "Paused");
    assert.equal(mapTrafficFactoryCampaignStatus("stopped"), "Stopped");
    assert.equal(mapTrafficFactoryCampaignStatus("pending"), "Draft");
    assert.equal(mapTrafficFactoryCampaignStatus(true), "Running");
    assert.equal(mapTrafficFactoryCampaignStatus(false), "Paused");
  });

  it("paginates campaign list via limit/offset (per the live docs, not page/per_page)", async () => {
    const pages: Record<number, unknown[]> = {
      0: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `C${i + 1}`, status: "active" })),
      100: [{ id: 101, name: "Last", status: "paused" }],
    };
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns$/);
      const offset = Number(url.searchParams.get("offset") ?? "0");
      assert.equal(url.searchParams.get("limit"), "100");
      return jsonResponse({ result: pages[offset] ?? [], request_metadata: { limit: 100, offset, count: 101 } });
    };
    const { items, pagesFetched } = await listTrafficFactoryCampaigns("session", fetchFn);
    assert.equal(pagesFetched, 2);
    assert.equal(items.length, 101);
    assert.equal(items[0].status, "Running");
    assert.equal(items[100].status, "Paused");
  });
});

describe("Traffic Factory statistics mapping (official /statistics/a/date schema)", () => {
  it("maps ddate->date, hits->impressions and cost->spend; ignores value for spend", () => {
    const row = parseTrafficFactoryDailyStatRow({
      ddate: "2026-10-01",
      idcampaign: "55",
      cost: 1.25,
      value: 999,
      hits: 777,
      clicks: 10,
      cpm: 1.1,
      avg_cpc: 0.12,
    });
    assert.ok(row);
    assert.equal(row!.date, "2026-10-01");
    assert.equal(row!.campaignExternalId, "55");
    assert.equal(row!.spend, 1.25);
    assert.equal(row!.impressions, 777);
    assert.equal(row!.clicks, 10);
    assert.equal(row!.skippedUnverifiedSpendKey, false);
    assert.equal(pickFirstNumber({ hits: 5 }, TF_IMPRESSION_KEYS), 5);
    assert.equal(pickFirstNumber({ value: 9 }, TF_SPEND_KEYS), null);
  });

  it("also accepts campaign_id (legacy alias) alongside idcampaign", () => {
    const row = parseTrafficFactoryDailyStatRow({ ddate: "2026-10-01", campaign_id: "1", impressions: 100, hits: 999, cost: 2 });
    assert.ok(row);
    assert.equal(row!.campaignExternalId, "1");
    assert.equal(row!.impressions, 100);
  });

  it("keeps spend null when only value is present (no silent value->spend)", () => {
    const row = parseTrafficFactoryDailyStatRow({ ddate: "2026-10-01", idcampaign: "1", value: 4, hits: 9 });
    assert.ok(row);
    assert.equal(row!.spend, null);
    assert.equal(row!.impressions, 9);
    assert.equal(row!.skippedUnverifiedSpendKey, true);
  });

  it("does not treat bare id as campaign id (account/row id ambiguity)", () => {
    const row = parseTrafficFactoryDailyStatRow({ ddate: "2026-10-01", id: 9001, cost: 2 });
    assert.ok(row);
    assert.equal(row!.campaignExternalId, null);
    assert.equal(row!.spend, 2);
  });

  it("rejects missing date", () => {
    assert.equal(parseTrafficFactoryDailyStatRow({ cost: 1, idcampaign: "1" }), null);
  });

  it("unwrap ignores resultTotal aggregate object", () => {
    const rows = unwrapTrafficFactoryStatisticsPayload({
      result: [{ ddate: "2026-10-01", idcampaign: "9", hits: 10, clicks: 1, cost: 0.5, value: 1 }],
      resultTotal: { hits: 10, clicks: 1, cost: 0.5, value: 1, cpm: 50, avg_cpc: 0.5 },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].idcampaign, "9");
    assert.equal(isTrafficFactoryResultTotal({ cost: 0.5, hits: 10, clicks: 1 }), true);
    assert.equal(isTrafficFactoryResultTotal({ ddate: "2026-10-01", cost: 0.5 }), false);
  });

  it("fetches /statistics/a/date with hyphenated date-from/date-to and additional_group_by=campaign", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/statistics\/a\/date$/);
      assert.equal(url.searchParams.get("date-from"), "2026-10-01");
      assert.equal(url.searchParams.get("date-to"), "2026-10-07");
      assert.equal(url.searchParams.get("additional_group_by"), "campaign");
      assert.equal(url.searchParams.has("filter[date_from]"), false);
      assert.equal(url.searchParams.has("date_from"), false);
      return jsonResponse({
        result: [
          { ddate: "2026-10-01", idcampaign: "9", hits: 50, clicks: 3, cost: 2, value: 200 },
          { ddate: "2026-10-02", cost: 1, hits: 10, clicks: 1 },
        ],
        resultTotal: { hits: 60, clicks: 4, cost: 3, value: 300 },
      });
    };
    const { items, pagesFetched } = await getTrafficFactoryDailyStats("session", "2026-10-01", "2026-10-07", fetchFn);
    assert.equal(pagesFetched, 1);
    assert.equal(items.length, 2);
    assert.equal(items[0].campaignExternalId, "9");
    assert.equal(items[0].impressions, 50);
    assert.equal(items[0].spend, 2);
    assert.equal(items[1].campaignExternalId, null);
    assert.ok(items.every((i) => i.date.startsWith("2026-10")));
  });

  it("surfaces HTTP failures", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ error: "nope" }, 500);
    await assert.rejects(
      () => getTrafficFactoryDailyStats("session", "2026-10-01", "2026-10-02", fetchFn),
      /Gagal mengambil \/statistics\/a\/date/
    );
  });
});

describe("Traffic Factory country breakdown (/statistics/a/country)", () => {
  it("maps country rows and keeps them tied to a campaign", () => {
    const row = parseTrafficFactoryCountryStatRow({ country: "US", idcampaign: "9", hits: 5, clicks: 1, cost: 0.3 });
    assert.ok(row);
    assert.equal(row!.country, "US");
    assert.equal(row!.campaignExternalId, "9");
    assert.equal(row!.impressions, 5);
  });

  it("returns null when country field is absent", () => {
    assert.equal(parseTrafficFactoryCountryStatRow({ idcampaign: "9", hits: 5 }), null);
  });

  it("fetches with the same date-from/date-to/additional_group_by contract as /date", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/statistics\/a\/country$/);
      assert.equal(url.searchParams.get("date-from"), "2026-10-05");
      assert.equal(url.searchParams.get("date-to"), "2026-10-05");
      assert.equal(url.searchParams.get("additional_group_by"), "campaign");
      return jsonResponse({ result: [{ country: "ID", idcampaign: "9", hits: 20, clicks: 2, cost: 1.1 }] });
    };
    const rows = await getTrafficFactoryCountryStats("session", "2026-10-05", "2026-10-05", fetchFn);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].country, "ID");
  });
});

describe("Traffic Factory campaign create/edit/pause/delete", () => {
  it("fetches advertiser ad type presets with their media storage templates", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/collections\/advertiser-ad-types$/);
      return jsonResponse({
        result: [{ id: 5, name: "Popunder", media_storage_templates: ["popunder"], size: ["Fullscreen"] }],
      });
    };
    const types = await getTrafficFactoryAdvertiserAdTypes("session", fetchFn);
    assert.equal(types.length, 1);
    assert.equal(types[0].id, 5);
    assert.deepEqual(types[0].mediaStorageTemplates, ["popunder"]);
  });

  it("fetches categories and drops non-selectable ones", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/collections\/categories$/);
      return jsonResponse({
        result: [
          { id: 1, name: "Adult", long_name: "Adult", parent: "0", selectable: 1 },
          { id: 2, name: "All", long_name: "All", parent: "0", selectable: 0 },
        ],
        request_metadata: { limit: 100, offset: 0, count: 2 },
      });
    };
    const categories = await getTrafficFactoryCategories("session", fetchFn);
    assert.equal(categories.length, 1);
    assert.equal(categories[0].id, 1);
  });

  it("creates a campaign with the nested collection/pricing shape, resolving ISO2 countries to ISO3, then resolves its id by name", async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push({ method, path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      if (method === "POST" && url.pathname === "/v2/campaigns") {
        return jsonResponse({}, 200); // 200 body isn't documented — must not be relied on
      }
      if (method === "GET" && url.pathname === "/v2/campaigns") {
        assert.equal(url.searchParams.get("custom_search"), "My Campaign");
        return jsonResponse({ result: [{ id: 777, name: "My Campaign" }] });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    };

    const result = await createTrafficFactoryCampaign(
      "session",
      {
        name: "My Campaign",
        advertiserAdType: 5,
        mediaStorageTemplate: "popunder",
        categoryIds: [1, 2],
        countries: ["US", "ID"],
        pricingModel: 2,
        price: 0.5,
        maxDailyBudget: 10,
        totalBudgetLimit: 100,
      },
      fetchFn
    );

    assert.equal(result.id, 777);
    const postCall = calls.find((c) => c.method === "POST")!;
    const body = postCall.body as Record<string, unknown>;
    assert.equal(body.name, "My Campaign");
    assert.equal(body.advertiser_ad_type, 5);
    assert.equal(body.media_storage_template, "popunder");
    assert.deepEqual(body.categories, { type: "targeted", elements: [1, 2] });
    // Confirmed from a live 400 response: countries targeting needs ISO3 ("USA"/"IDN"), not ISO2.
    assert.deepEqual(body.countries, { type: "targeted", elements: [{ country: "USA" }, { country: "IDN" }] });
    assert.deepEqual(body.pricing, { model: 2, price: 0.5 });
    assert.equal(body.max_daily_budget, 10);
    assert.equal(body.daily_limit_type, 1);
    assert.equal(body.total_budget_limit, 100);
  });

  it("accepts ISO3 country codes directly, passing them through unchanged", async () => {
    let postBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      if (init?.method === "POST") {
        postBody = JSON.parse(String(init.body));
        return jsonResponse({});
      }
      return jsonResponse({ result: [{ id: 1, name: "ISO3 test" }] });
    };
    await createTrafficFactoryCampaign(
      "session",
      {
        name: "ISO3 test",
        advertiserAdType: 1,
        mediaStorageTemplate: "popunder",
        categoryIds: [1],
        countries: ["IDN"],
        pricingModel: 2,
        price: 1,
      },
      fetchFn
    );
    assert.deepEqual(postBody?.countries, { type: "targeted", elements: [{ country: "IDN" }] });
  });

  it("rejects a country code Traffic Factory doesn't recognize instead of sending it blind", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      return jsonResponse({ error: "should not be reached" }, 500);
    };
    await assert.rejects(
      () =>
        createTrafficFactoryCampaign(
          "session",
          {
            name: "Bad country",
            advertiserAdType: 1,
            mediaStorageTemplate: "popunder",
            categoryIds: [1],
            countries: ["ZZ"],
            pricingModel: 2,
            price: 1,
          },
          fetchFn
        ),
      /Kode negara nggak dikenali/
    );
  });

  it("prefers an exact name match over a highest-id fallback when resolving the created campaign", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      if (init?.method === "POST") return jsonResponse({});
      return jsonResponse({
        result: [
          { id: 50, name: "Promo Summer Extended" },
          { id: 42, name: "Promo Summer" },
        ],
      });
    };
    const result = await createTrafficFactoryCampaign(
      "session",
      {
        name: "Promo Summer",
        advertiserAdType: 1,
        mediaStorageTemplate: "popunder",
        categoryIds: [1],
        countries: ["US"],
        pricingModel: 2,
        price: 1,
      },
      fetchFn
    );
    assert.equal(result.id, 42);
  });

  it("throws a clear error when the created campaign can't be found by name afterwards", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      if (init?.method === "POST") return jsonResponse({});
      return jsonResponse({ result: [] });
    };
    await assert.rejects(
      () =>
        createTrafficFactoryCampaign(
          "session",
          {
            name: "Ghost Campaign",
            advertiserAdType: 1,
            mediaStorageTemplate: "popunder",
            categoryIds: [1],
            countries: ["US"],
            pricingModel: 2,
            price: 1,
          },
          fetchFn
        ),
      /gagal nemuin ID/
    );
  });

  it("only sends fields that were actually provided on update (partial PUT)", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(init?.method, "PUT");
      assert.match(url.pathname, /\/campaigns\/123$/);
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryCampaign("session", 123, { name: "New Name", pricingModel: 1, price: 2 }, fetchFn);
    assert.deepEqual(capturedBody, { name: "New Name", pricing: { model: 1, price: 2 } });
  });

  it("resolves ISO2 to ISO3 on update too, only when countries is actually being changed", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      assert.equal(init?.method, "PUT");
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryCampaign("session", 123, { countries: ["ID"] }, fetchFn);
    assert.deepEqual(capturedBody, { countries: { type: "targeted", elements: [{ country: "IDN" }] } });
  });

  it("parses a campaign detail response, splitting out the calculated status label", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/123$/);
      return jsonResponse({
        id: 123,
        name: "Promo",
        status: 1,
        calculated_status: { id: 1, status: "Running" },
        price: 0.5,
        pricing_model: 2,
        max_daily_budget: 10,
        total_budget_limit: 0,
        advertiser_ad_type: 5,
        media_storage_template: "popunder",
      });
    };
    const detail = await getTrafficFactoryCampaign("session", 123, fetchFn);
    assert.equal(detail.status, 1);
    assert.equal(detail.statusLabel, "Running");
    assert.equal(detail.price, 0.5);
    assert.equal(detail.pricingModel, 2);
  });

  it("sends campaign_ids for play/pause and surfaces partial errors from the bulk response", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/pause$/);
      assert.deepEqual(JSON.parse(String(init?.body)), { campaign_ids: [123] });
      return jsonResponse({ message: "done", errors: ["campaign 123 is locked"], campaigns: [] });
    };
    await assert.rejects(() => setTrafficFactoryCampaignsRunState("session", [123], "pause", fetchFn), /menolak sebagian aksi/);
  });

  it("deletes campaigns via PUT /campaigns/delete with the same bulk body shape", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(init?.method, "PUT");
      assert.match(url.pathname, /\/campaigns\/delete$/);
      assert.deepEqual(JSON.parse(String(init?.body)), { campaign_ids: [1, 2] });
      return jsonResponse({ message: "deleted", campaigns: [] });
    };
    await deleteTrafficFactoryCampaigns("session", [1, 2], fetchFn);
  });
});
