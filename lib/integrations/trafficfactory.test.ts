import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPersistTrafficFactoryBalance,
  createTrafficFactoryCampaign,
  createTrafficFactoryVariation,
  deleteTrafficFactoryCampaigns,
  deleteTrafficFactoryVariation,
  getTrafficFactoryAdvertiserAdTypes,
  getTrafficFactoryBrowsers,
  getTrafficFactoryCampaign,
  getTrafficFactoryCarriers,
  getTrafficFactoryCategories,
  getTrafficFactoryDevices,
  getTrafficFactoryLanguages,
  getTrafficFactoryOperatingSystems,
  getTrafficFactoryTimezones,
  getTrafficFactoryCountryStats,
  getTrafficFactoryDailyStats,
  getTrafficFactorySessionToken,
  getTrafficFactoryUser,
  listTrafficFactoryCampaigns,
  listTrafficFactoryVariations,
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
  updateTrafficFactoryVariation,
  uploadTrafficFactoryLibraryFile,
  uploadTrafficFactoryLibraryUrl,
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
  it("fetches advertiser ad type presets from the plain call, merging in aspect_ratios from a separate show_details=true call", async () => {
    const calls: string[] = [];
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/collections\/advertiser-ad-types$/);
      const detailed = url.searchParams.get("show_details") === "true";
      calls.push(detailed ? "detailed" : "plain");
      if (!detailed) {
        // The plain call is the one already proven in production — no aspect_ratios here at all.
        return jsonResponse({ result: [{ id: 5, name: "img_banner", media_storage_templates: ["img_banner"], size: ["300x250"] }] });
      }
      return jsonResponse({
        result: [
          {
            id: 5,
            name: "img_banner",
            aspect_ratios: [
              { id: 1, aspect_ratio: "1.2:1", tag: "300x250 (+/- 10%)", flexibility: 10, min_width: 270, max_width: 330, min_height: 225, max_height: 275 },
            ],
          },
        ],
      });
    };
    const types = await getTrafficFactoryAdvertiserAdTypes("session", fetchFn);
    assert.deepEqual(calls.sort(), ["detailed", "plain"]);
    assert.equal(types.length, 1);
    assert.equal(types[0].id, 5);
    assert.deepEqual(types[0].mediaStorageTemplates, ["img_banner"]);
    assert.deepEqual(types[0].aspectRatios, [{ tag: "300x250 (+/- 10%)", minWidth: 270, maxWidth: 330, minHeight: 225, maxHeight: 275 }]);
  });

  it("keeps media_storage_templates from the plain call even if the show_details call returns them in a different (non-string) shape", async () => {
    // Regression test: a live account returned media_storage_templates as objects, not strings,
    // when show_details=true, which silently emptied every ad type's templates when both concerns
    // shared one call. The plain call must stay the source of truth for templates/size.
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("show_details") === "true";
      if (!detailed) {
        return jsonResponse({ result: [{ id: 5, name: "img_banner", media_storage_templates: ["img_banner"], size: ["300x250"] }] });
      }
      return jsonResponse({ result: [{ id: 5, name: "img_banner", media_storage_templates: [{ tag: "img_banner" }], size: [{ tag: "300x250" }] }] });
    };
    const types = await getTrafficFactoryAdvertiserAdTypes("session", fetchFn);
    assert.deepEqual(types[0].mediaStorageTemplates, ["img_banner"]);
    assert.deepEqual(types[0].sizes, ["300x250"]);
  });

  it("returns an empty aspectRatios array when the ad type has none (not crashing on a missing field)", async () => {
    const fetchFn: TfFetch = async () =>
      jsonResponse({ result: [{ id: 1, name: "Popunder", media_storage_templates: ["popunder"], size: ["Fullscreen"] }] });
    const types = await getTrafficFactoryAdvertiserAdTypes("session", fetchFn);
    assert.deepEqual(types[0].aspectRatios, []);
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

  it("fetches devices/browsers/operating-systems/languages as plain {id,name} dictionaries", async () => {
    const dictFetch =
      (expectedPath: RegExp): TfFetch =>
      async (input) => {
        const url = new URL(String(input));
        assert.match(url.pathname, expectedPath);
        return jsonResponse({ result: [{ id: 1, name: "Chrome" }] });
      };
    assert.deepEqual(await getTrafficFactoryDevices("session", dictFetch(/\/collections\/devices$/)), [{ id: 1, name: "Chrome" }]);
    assert.deepEqual(await getTrafficFactoryBrowsers("session", dictFetch(/\/collections\/browsers$/)), [{ id: 1, name: "Chrome" }]);
    assert.deepEqual(
      await getTrafficFactoryOperatingSystems("session", dictFetch(/\/collections\/operating-systems$/)),
      [{ id: 1, name: "Chrome" }]
    );
    assert.deepEqual(await getTrafficFactoryLanguages("session", dictFetch(/\/collections\/languages$/)), [{ id: 1, name: "Chrome" }]);
  });

  it("fetches carriers as a flat global dictionary (no country path param)", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/collections\/carriers$/);
      assert.equal(url.pathname.includes("undefined"), false);
      return jsonResponse({ result: [{ id: 7, name: "Vodafone", country_id: 2, enabled: 1 }] });
    };
    const carriers = await getTrafficFactoryCarriers("session", fetchFn);
    assert.deepEqual(carriers, [{ id: 7, name: "Vodafone" }]);
  });

  it("fetches and dedupes timezone names", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/collections\/timezones$/);
      return jsonResponse({
        result: [
          { name: "Asia/Jakarta", country_iso3: "IDN" },
          { name: "Asia/Jakarta", country_iso3: "IDN" },
          { name: "Europe/Dublin", country_iso3: "IRL" },
        ],
      });
    };
    const timezones = await getTrafficFactoryTimezones("session", fetchFn);
    assert.deepEqual(timezones, ["Asia/Jakarta", "Europe/Dublin"]);
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
        size: "300x250",
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
    assert.equal(body.size, "300x250");
    assert.deepEqual(body.categories, { type: "targeted", elements: [1, 2] });
    // Confirmed from a live 400 response: countries targeting needs ISO3 ("USA"/"IDN"), not ISO2.
    assert.deepEqual(body.countries, { type: "targeted", elements: [{ country: "USA" }, { country: "IDN" }] });
    // Confirmed from a live 400 response ("...specify amount in cents"): money fields are
    // integer cents on this API, so $0.50/$10/$100 become 50/1000/10000.
    assert.deepEqual(body.pricing, { model: 2, price: 50 });
    assert.equal(body.max_daily_budget, 1000);
    assert.equal(body.daily_limit_type, 1);
    assert.equal(body.total_budget_limit, 10000);
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

  it("includes extended targeting (devices/dates/impressions/capping/block-lists) on create too, when given", async () => {
    let postBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v2/collections/countries") return jsonResponse(COUNTRY_FIXTURE);
      if (init?.method === "POST") {
        postBody = JSON.parse(String(init.body));
        return jsonResponse({});
      }
      return jsonResponse({ result: [{ id: 1, name: "Full campaign" }] });
    };
    await createTrafficFactoryCampaign(
      "session",
      {
        name: "Full campaign",
        advertiserAdType: 1,
        mediaStorageTemplate: "popunder",
        categoryIds: [1],
        countries: ["US"],
        pricingModel: 2,
        price: 1,
        deviceIds: [10],
        browserIds: [5],
        osIds: [20],
        languageIds: [1],
        carrierIds: [7],
        startDate: "2026-11-01",
        endDate: "2026-12-01",
        totalImpressions: 100000,
        maxDailyImpressions: 5000,
        frequencyCapping: { enabled: true, impressions: 3, minutes: 1440 },
        sites: { targeted: [], blocked: ["bad-site.com"] },
        keywords: { targeted: ["promo"], blocked: [] },
        ipRanges: { targeted: [], blocked: [] },
        dayParting: { timezone: "Asia/Jakarta", parting: [{ day: 1, hours: [9, 10, 11] }] },
      },
      fetchFn
    );
    assert.deepEqual(postBody?.devices, { type: "targeted", elements: [10] });
    assert.deepEqual(postBody?.browsers, { type: "targeted", elements: [5] });
    assert.deepEqual(postBody?.operating_systems, { type: "targeted", elements: [20] });
    assert.deepEqual(postBody?.languages, { type: "targeted", elements: [1] });
    assert.deepEqual(postBody?.carriers, { type: "targeted", elements: [7] });
    assert.deepEqual(postBody?.day_parting, { timezone: "Asia/Jakarta", parting: [{ day: 1, hours: [9, 10, 11] }] });
    assert.equal(postBody?.start_date, "2026-11-01");
    assert.equal(postBody?.end_date, "2026-12-01");
    assert.equal(postBody?.total_impressions, 100000);
    assert.equal(postBody?.max_daily_impressions, 5000);
    assert.deepEqual(postBody?.frequency_capping, { enabled: true, impressions: 3, minutes: 1440 });
    assert.deepEqual(postBody?.sites, { targeted: [], blocked: ["bad-site.com"] });
    assert.deepEqual(postBody?.keywords, { targeted: ["promo"], blocked: [] });
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
    assert.deepEqual(capturedBody, { name: "New Name", pricing: { model: 1, price: 200 } });
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

  it("sends status, dictionary targeting, dates, frequency capping and block-lists as given", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryCampaign(
      "session",
      123,
      {
        status: 0,
        deviceIds: [10, 11],
        browserIds: [5],
        osIds: [20],
        languageIds: [1],
        startDate: "2026-11-01",
        endDate: null,
        totalImpressions: 50000,
        maxDailyImpressions: 2000,
        frequencyCapping: { enabled: true, impressions: 3, minutes: 1440 },
        sites: { targeted: [], blocked: ["bad-site.com"] },
        keywords: { targeted: ["promo"], blocked: [] },
        ipRanges: { targeted: [], blocked: ["1.2.3.0/24"] },
      },
      fetchFn
    );
    assert.deepEqual(capturedBody, {
      status: 0,
      devices: { type: "targeted", elements: [10, 11] },
      browsers: { type: "targeted", elements: [5] },
      operating_systems: { type: "targeted", elements: [20] },
      languages: { type: "targeted", elements: [1] },
      start_date: "2026-11-01",
      end_date: null,
      total_impressions: 50000,
      max_daily_impressions: 2000,
      daily_limit_type: 2,
      frequency_capping: { enabled: true, impressions: 3, minutes: 1440 },
      sites: { targeted: [], blocked: ["bad-site.com"] },
      keywords: { targeted: ["promo"], blocked: [] },
      ip_ranges: { targeted: [], blocked: ["1.2.3.0/24"] },
    });
  });

  it("omits categories/countries from the update body when given empty, instead of sending an empty collection TF rejects", async () => {
    // Confirmed live (400): "Campaign categories elements cannot be empty." / "...countries
    // elements cannot be empty." A cleared selection means "leave it as-is", not "clear it" —
    // there's no supported way to clear these via this endpoint.
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryCampaign("session", 123, { name: "New Name", categoryIds: [], countries: [] }, fetchFn);
    assert.deepEqual(capturedBody, { name: "New Name" });
  });

  it("omits total_budget_limit/max_daily_budget/total_impressions/max_daily_impressions when given 0, instead of a value below TF's minimum", async () => {
    // Confirmed live (400): "total budget limit should be >= 2000" / "total impressions should be
    // >= 1000". The edit form sends 0 for a blank ("unlimited") field — treat 0 the same as
    // undefined ("don't touch this field") rather than passing it through literally.
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryCampaign(
      "session",
      123,
      { name: "New Name", maxDailyBudget: 0, totalBudgetLimit: 0, totalImpressions: 0, maxDailyImpressions: 0 },
      fetchFn
    );
    assert.deepEqual(capturedBody, { name: "New Name" });
  });

  it("omits devices/browsers/os/languages/carriers/sites/keywords/ip_ranges from the update body when given empty, instead of a dimension the account may not have access to", async () => {
    // Confirmed live (400): "Carriers dimension is not available for the user." / "Sites dimension
    // is not available for the user." / "Ip Ranges dimension is not available for the user." — this
    // account's plan rejects the field just for being present, even explicitly empty. The edit form
    // always sends every targeting collection, most commonly empty (nothing picked), so every
    // optional collection here needs the same "omit when empty" treatment, not just the 3 confirmed.
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryCampaign(
      "session",
      123,
      {
        name: "New Name",
        deviceIds: [],
        browserIds: [],
        osIds: [],
        languageIds: [],
        carrierIds: [],
        sites: { targeted: [], blocked: [] },
        keywords: { targeted: [], blocked: [] },
        ipRanges: { targeted: [], blocked: [] },
      },
      fetchFn
    );
    assert.deepEqual(capturedBody, { name: "New Name" });
  });

  it("parses flat campaign fields from the plain call and sibling collections from the detailed call, converting cents to dollars", async () => {
    // Detailed-call collection shapes below are the actual confirmed live shape (campaign 166310):
    // {targeted: [...full objects...], blocked: [...]} per collection — NOT the {type, elements:
    // [ids]} shape used on the write side for the same concepts. Each targeted item carries its own
    // id (and iso2 for countries) directly, so no separate countries lookup is needed to read these.
    const calls: string[] = [];
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/123$/);
      const detailed = url.searchParams.get("detailed") === "true";
      calls.push(detailed ? "detailed" : "plain");
      if (!detailed) {
        // Plain call: flat fields only, no sibling collections — same shape already proven
        // correct elsewhere (e.g. listTrafficFactoryCampaigns).
        return jsonResponse({
          id: 123,
          name: "Promo",
          status: 1,
          calculated_status: { id: 1, status: "Running" },
          price: 50, // cents -> $0.50
          pricing_model: 2,
          max_daily_budget: 1000, // cents -> $10
          total_budget_limit: 0,
          advertiser_ad_type: 5,
          media_storage_template: "popunder",
          start_date: "2026-11-01",
          end_date: "2026-12-01",
          total_impressions: 100000,
          max_daily_impressions: 5000,
          capping: { quantity: 3, frequency: 1440, level: "Campaign" },
          parting_timezone: "Asia/Jakarta",
        });
      }
      // Detailed call: no flat fields at all (deliberately, to prove they're never read from here) —
      // only the sibling targeting collections.
      return jsonResponse({
        countries: { targeted: [{ id: 2, iso2: "ID", iso3: "IDN" }, { id: 1, iso2: "US", iso3: "USA" }], blocked: [] },
        categories: { targeted: [{ id: 1, name: "A" }, { id: 2, name: "B" }], blocked: [] },
        devices: { targeted: [{ id: 10, name: "iPhone" }], blocked: [] },
        browsers: [], // confirmed live: bare array when nothing is targeted
        operating_systems: { targeted: [{ id: 20 }, { id: 21 }], blocked: [] },
        languages: [],
        sites: { targeted: [{ url: "example.com" }], blocked: [] },
        keywords: { targeted: [], blocked: [{ keyword: "spam" }] },
        ip_ranges: { targeted: [], blocked: [] },
        carriers: { targeted: [{ id: 7 }], blocked: [] },
        day_parting: [{ day: 1, hours: [9, 10] }],
      });
    };
    const detail = await getTrafficFactoryCampaign("session", 123, fetchFn);
    assert.deepEqual(calls.sort(), ["detailed", "plain"]);
    assert.equal(detail.name, "Promo");
    assert.equal(detail.status, 1);
    assert.equal(detail.statusLabel, "Running");
    assert.equal(detail.price, 0.5);
    assert.equal(detail.maxDailyBudget, 10);
    assert.equal(detail.pricingModel, 2);
    assert.equal(detail.startDate, "2026-11-01");
    assert.equal(detail.totalImpressions, 100000);
    assert.equal(detail.frequencyCappingImpressions, 3);
    assert.equal(detail.frequencyCappingMinutes, 1440);
    assert.deepEqual(detail.countries, ["ID", "US"]);
    assert.deepEqual(detail.categoryIds, [1, 2]);
    assert.deepEqual(detail.deviceIds, [10]);
    assert.deepEqual(detail.osIds, [20, 21]);
    assert.deepEqual(detail.carrierIds, [7]);
    assert.equal(detail.dayPartingTimezone, "Asia/Jakarta");
    assert.deepEqual(detail.dayParting, [{ day: 1, hours: [9, 10] }]);
    assert.deepEqual(detail.sites, { targeted: ["example.com"], blocked: [] });
    assert.deepEqual(detail.keywords, { targeted: [], blocked: ["spam"] });
  });

  it("keeps name/price/status from the plain call even if the detailed call wraps or omits them differently", async () => {
    // Regression test: a live account's detailed=true response left name/price/status unreadable
    // when the code tried to read flat fields from the detailed payload. The plain call must stay
    // the only source for those, no matter what shape the detailed call's own fields take.
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) {
        return jsonResponse({ id: 123, name: "Real Name", status: 1, price: 50, pricing_model: 2 });
      }
      // Pathological detailed response: campaign-shaped data nested oddly, nothing at top level.
      return jsonResponse({ campaign: { name: "Should Not Be Used", status: 0 }, countries: { targeted: [] } });
    };
    const detail = await getTrafficFactoryCampaign("session", 123, fetchFn);
    assert.equal(detail.name, "Real Name");
    assert.equal(detail.status, 1);
    assert.equal(detail.price, 0.5);
  });

  it("unwraps the plain call's campaign object from a result/data wrapper when it isn't at the top level", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) {
        // Wrapped like the list endpoints, not flat at the top level.
        return jsonResponse({ result: { id: 123, name: "Wrapped Name", status: 1, price: 50 } });
      }
      return jsonResponse({ countries: { targeted: [] } });
    };
    const detail = await getTrafficFactoryCampaign("session", 123, fetchFn);
    assert.equal(detail.name, "Wrapped Name");
    assert.equal(detail.id, 123);
  });

  it("unwraps a single campaign from a one-item result array (confirmed live shape: GET /campaigns/{id} reuses the list envelope)", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) {
        return jsonResponse({
          result: [{ id: 166310, name: "tester5", status: 0, price: 10, pricing_model: 2 }],
          request_metadata: { limit: 50, offset: 0, count: 1 },
        });
      }
      return jsonResponse({ countries: { targeted: [] } });
    };
    const detail = await getTrafficFactoryCampaign("session", 166310, fetchFn);
    assert.equal(detail.id, 166310);
    assert.equal(detail.name, "tester5");
    assert.equal(detail.status, 0);
  });

  it("unwraps { result: { campaign: {...} } } — the actual confirmed live shape of GET /campaigns/{id}, one level deeper than { campaign: {...} }", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) {
        return jsonResponse({
          result: {
            campaign: {
              id: 166310,
              is_editable: true,
              name: "tester5",
              idgroup: null,
              advertiser_ad_type: 14,
              media_storage_template: "img_banner",
              size: "300x100",
              // Confirmed live: pricing_model comes back as {id, name}, not a bare integer.
              pricing_model: { id: 0, name: "Standard" },
              status: 0,
              price: 10,
            },
          },
        });
      }
      return jsonResponse({ countries: { targeted: [] } });
    };
    const detail = await getTrafficFactoryCampaign("session", 166310, fetchFn);
    assert.equal(detail.id, 166310);
    assert.equal(detail.name, "tester5");
    assert.equal(detail.pricingModel, 0);
    assert.equal(detail.advertiserAdType, 14);
    assert.equal(detail.size, "300x100");
  });

  it("also unwraps the detailed call's sibling targeting collections from a .result wrapper, not just the top level", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) {
        return jsonResponse({ result: { campaign: { id: 166310, name: "tester5" } } });
      }
      // Sibling collections nested under .result instead of at the top level, mirroring the
      // plain call's confirmed wrapper pattern.
      return jsonResponse({
        result: {
          countries: { targeted: [{ id: 2, iso2: "ID", iso3: "IDN" }], blocked: [] },
          categories: { targeted: [{ id: 1 }, { id: 2 }, { id: 3 }], blocked: [] },
          devices: { targeted: [{ id: 10 }], blocked: [] },
        },
      });
    };
    const detail = await getTrafficFactoryCampaign("session", 166310, fetchFn);
    assert.deepEqual(detail.countries, ["ID"]);
    assert.deepEqual(detail.categoryIds, [1, 2, 3]);
    assert.deepEqual(detail.deviceIds, [10]);
  });

  it("doesn't discard sibling targeting collections when the detailed call nests `campaign` alongside them under .result (the actual confirmed live shape)", async () => {
    // Confirmed live from campaign 166310: the detailed call's real shape is
    // { campaign: {...flat...}, countries: {targeted:[...]}, categories: {targeted:[...]},
    // devices: {targeted:[...]}, ... } — no .result wrapper at all this time (CampaignDetail is the
    // documented top-level response shape), and campaign/siblings are SIBLINGS, not nested. Reusing
    // unwrapSingleCampaignObject (built for the plain call) here was digging straight into
    // result.campaign/.campaign because it has id/name and matches first, silently dropping every
    // sibling collection — Edit showed 0 countries/categories for every campaign with this shape.
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) {
        return jsonResponse({ result: { campaign: { id: 166310, name: "tester5", status: 1, price: 1 } } });
      }
      return jsonResponse({
        campaign: { id: 166310, name: "tester5", status: 1, price: 1 },
        countries: { targeted: [{ id: 2, iso2: "ID", iso3: "IDN" }], blocked: [] },
        categories: { targeted: [{ id: 5 }], blocked: [] },
        devices: { targeted: [{ id: 10 }], blocked: [] },
      });
    };
    const detail = await getTrafficFactoryCampaign("session", 166310, fetchFn);
    assert.equal(detail.name, "tester5");
    assert.deepEqual(detail.countries, ["ID"]);
    assert.deepEqual(detail.categoryIds, [5]);
    assert.deepEqual(detail.deviceIds, [10]);
  });

  it("throws a diagnosable error instead of silently rendering a blank form when id/name can't be found anywhere", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      const detailed = url.searchParams.get("detailed") === "true";
      if (!detailed) return jsonResponse({ some_unexpected_field: "mystery shape" });
      return jsonResponse({ countries: { targeted: [] } });
    };
    await assert.rejects(() => getTrafficFactoryCampaign("session", 123, fetchFn), /Nggak nemu field id\/name/);
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

describe("Traffic Factory creative upload (Library -> Variation, two separate calls)", () => {
  it("uploads a file to the Library with type=image and returns its id", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/library\/file$/);
      assert.equal(init?.method, "POST");
      assert.equal(url.searchParams.get("type"), "image");
      assert.equal(url.searchParams.get("advertiser_ad_type_id"), "5");
      assert.ok(init?.body instanceof FormData);
      return jsonResponse({ id: 99, type: "image", width: 300, height: 250, url: "https://cdn.example/99.png" });
    };
    const file = new File(["fake-bytes"], "banner.png", { type: "image/png" });
    const result = await uploadTrafficFactoryLibraryFile("session", file, { advertiserAdTypeId: 5 }, fetchFn);
    assert.equal(result.id, 99);
    assert.equal(result.url, "https://cdn.example/99.png");
  });

  it("unwraps a .result-wrapped /library/file response too, same pattern confirmed on GET /campaigns/{id}", async () => {
    const fetchFn: TfFetch = async () =>
      jsonResponse({ result: { id: 99, type: "image", url: "https://cdn.example/99.png" } });
    const file = new File(["fake-bytes"], "banner.png", { type: "image/png" });
    const result = await uploadTrafficFactoryLibraryFile("session", file, {}, fetchFn);
    assert.equal(result.id, 99);
  });

  it("unwraps a .result-wrapped /library/url response too", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ result: { id: 7, url: "https://example.com/offer", status: 1 } });
    const result = await uploadTrafficFactoryLibraryUrl("session", "https://example.com/offer", fetchFn);
    assert.equal(result.id, 7);
  });

  it("unwraps /library/url's actual confirmed shape: a bare array at the top level, no wrapper at all", async () => {
    const fetchFn: TfFetch = async () =>
      jsonResponse([
        {
          id: 79504,
          created_at: "2026-10-21 04:42:57",
          updated_at: "",
          last_used_at: "2026-10-21 04:42:57",
          is_adult: 0,
          url: "https://partner-resmi-rbtv.pages.dev/",
          status: 1,
        },
      ]);
    const result = await uploadTrafficFactoryLibraryUrl("session", "https://partner-resmi-rbtv.pages.dev/", fetchFn);
    assert.equal(result.id, 79504);
    assert.equal(result.url, "https://partner-resmi-rbtv.pages.dev/");
  });

  it("creates a variation referencing the uploaded Library file AND Library url ids, never a raw file or durl string", async () => {
    // Confirmed from a live 400 ("Parameter durl not allowed in img_banner") that at least some
    // media storage templates reject a raw durl string — the landing URL must go through
    // /library/url first too, same as the image goes through /library/file.
    let capturedForm: FormData | undefined;
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/42\/variation$/);
      assert.equal(init?.method, "POST");
      capturedForm = init?.body as FormData;
      return new Response("", { status: 200 });
    };
    await createTrafficFactoryVariation("session", 42, { idLibraryFile: 99, idLibraryUrl: 7 }, fetchFn);
    assert.equal(capturedForm?.get("id_library_file"), "99");
    assert.equal(capturedForm?.get("id_library_url"), "7");
    assert.equal(capturedForm?.get("durl"), null);
    assert.equal(capturedForm?.get("file"), null); // the file itself was never part of this call
  });

  it("registers a landing URL in the Library via a JSON POST, returning its id", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/library\/url$/);
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { url: "https://example.com/offer" });
      return jsonResponse({ id: 7, url: "https://example.com/offer", status: 1 });
    };
    const result = await uploadTrafficFactoryLibraryUrl("session", "https://example.com/offer", fetchFn);
    assert.equal(result.id, 7);
    assert.equal(result.url, "https://example.com/offer");
  });

  it("lists variations, reading imgurl/durl/idvariation per the live VariationDetails schema", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/42\/variation$/);
      return jsonResponse({
        variations: [
          {
            idvariation: 7,
            name: "Promo banner",
            active: 1,
            imgurl: "https://cdn.example/7.png",
            durl: "https://example.com/offer",
            calculated_status: { status: "Pending" },
          },
        ],
      });
    };
    const variations = await listTrafficFactoryVariations("session", 42, fetchFn);
    assert.equal(variations.length, 1);
    assert.equal(variations[0].id, 7);
    assert.equal(variations[0].active, true);
    assert.equal(variations[0].imageUrl, "https://cdn.example/7.png");
    assert.equal(variations[0].statusLabel, "Pending");
  });

  it("resolves the real landing URL via /library/url?id_url, not the TF click-tracking redirect in durl/click_url", async () => {
    // Confirmed live: a variation created via id_library_url comes back with durl empty and
    // click_url set to TF's own tracking wrapper (https://s.tf4srv.com/click.php?d=...), not the
    // https://partner-resmi-rbtv.pages.dev/ the user actually typed in. The raw value only lives
    // in the Library entry itself, fetched by idvariations_url.
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/variation") && !url.pathname.includes("library")) {
        return jsonResponse({
          variations: [
            {
              idvariation: 7,
              name: "Promo banner",
              active: 1,
              click_url: "https://s.tf4srv.com/click.php?d=H4sIAAAAAAAA",
              idvariations_url: 123,
            },
          ],
        });
      }
      if (url.pathname.endsWith("/library/url")) {
        assert.equal(url.searchParams.get("id_url"), "123");
        return jsonResponse({ id: 123, url: "https://partner-resmi-rbtv.pages.dev/", status: 1 });
      }
      throw new Error(`Unexpected request to ${url.pathname}`);
    };
    const variations = await listTrafficFactoryVariations("session", 42, fetchFn);
    assert.equal(variations[0].landingUrl, "https://partner-resmi-rbtv.pages.dev/");
  });

  it("keeps the durl/click_url fallback when the /library/url lookup fails, instead of blanking the row", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/library/url")) return new Response("", { status: 500 });
      return jsonResponse({
        variations: [
          { idvariation: 7, name: "Promo banner", active: 1, click_url: "https://s.tf4srv.com/click.php?d=x", idvariations_url: 123 },
        ],
      });
    };
    const variations = await listTrafficFactoryVariations("session", 42, fetchFn);
    assert.equal(variations[0].landingUrl, "https://s.tf4srv.com/click.php?d=x");
  });

  it("reads landingUrl from click_url or url when durl is absent, since a variation created via id_library_url doesn't echo durl back", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/42\/variation$/);
      return jsonResponse({
        variations: [
          {
            idvariation: 7,
            name: "No durl, has click_url",
            active: 1,
            click_url: "https://example.com/from-click-url",
          },
          {
            idvariation: 8,
            name: "No durl, has url",
            active: 1,
            url: "https://example.com/from-url",
          },
        ],
      });
    };
    const variations = await listTrafficFactoryVariations("session", 42, fetchFn);
    assert.equal(variations[0].landingUrl, "https://example.com/from-click-url");
    assert.equal(variations[1].landingUrl, "https://example.com/from-url");
  });

  it("updates a variation's landing URL/name/brand via PUT with a JSON body, never id_library_file (the schema has none)", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns\/42\/variation\/7$/);
      assert.equal(init?.method, "PUT");
      assert.deepEqual(JSON.parse(String(init?.body)), { id_library_url: 7, name: "New name", brand: "New brand" });
      return new Response("", { status: 200 });
    };
    await updateTrafficFactoryVariation(
      "session",
      42,
      7,
      { idLibraryUrl: 7, name: "New name", brand: "New brand" },
      fetchFn
    );
  });

  it("deletes (archives) a variation via DELETE /campaigns/{id}/variation/{id}", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(init?.method, "DELETE");
      assert.match(url.pathname, /\/campaigns\/42\/variation\/7$/);
      return jsonResponse({ message: "archived" });
    };
    await deleteTrafficFactoryVariation("session", 42, 7, fetchFn);
  });

  it("surfaces HTTP failures from the Library upload with the response body", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ message: ["File too large"] }, 400);
    const file = new File(["fake-bytes"], "banner.png", { type: "image/png" });
    await assert.rejects(() => uploadTrafficFactoryLibraryFile("session", file, {}, fetchFn), /File too large/);
  });
});
