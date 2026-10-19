import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPersistTrafficFactoryBalance,
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
  unwrapTrafficFactoryStatisticsPayload,
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
