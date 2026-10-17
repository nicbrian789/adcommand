import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canPersistTrafficFactoryBalance,
  getTrafficFactoryDailyStats,
  getTrafficFactorySessionToken,
  getTrafficFactoryUser,
  listTrafficFactoryCampaigns,
  mapTrafficFactoryCampaignStatus,
  parseTrafficFactoryDailyStatRow,
  parseTrafficFactorySessionToken,
  parseTrafficFactoryUser,
  pickFirstNumber,
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

describe("Traffic Factory auth", () => {
  it("parses session token from login JSON (compatibility path)", () => {
    assert.equal(parseTrafficFactorySessionToken('"abc-session"'), "abc-session");
    assert.equal(parseTrafficFactorySessionToken(JSON.stringify({ session_token: "tok123" })), "tok123");
  });

  it("exchanges API token via POST /login (mocked)", async () => {
    const fetchFn: TfFetch = async (input, init) => {
      assert.match(String(input), /\/login$/);
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.api_token, "api-key-test");
      return jsonResponse({ access_token: "session-xyz" });
    };
    const session = await getTrafficFactorySessionToken("api-key-test", fetchFn);
    assert.equal(session, "session-xyz");
  });

  it("fails auth on non-OK login", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ error: "denied" }, 401);
    await assert.rejects(() => getTrafficFactorySessionToken("bad", fetchFn), /Login Traffic Factory gagal/);
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

  it("paginates campaign list", async () => {
    const pages: Record<number, unknown[]> = {
      1: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `C${i + 1}`, status: "active" })),
      2: [{ id: 101, name: "Last", status: "paused" }],
    };
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/campaigns$/);
      const page = Number(url.searchParams.get("page") ?? "1");
      return jsonResponse({ items: pages[page] ?? [] });
    };
    const { items, pagesFetched } = await listTrafficFactoryCampaigns("session", fetchFn);
    assert.equal(pagesFetched, 2);
    assert.equal(items.length, 101);
    assert.equal(items[0].status, "Running");
    assert.equal(items[100].status, "Paused");
  });
});

describe("Traffic Factory statistics mapping", () => {
  it("when both value and cost exist, maps spend from cost only", () => {
    const row = parseTrafficFactoryDailyStatRow({
      date: "2026-10-01",
      campaign_id: "55",
      cost: 1.25,
      value: 999,
      impressions: 1000,
      hits: 777,
      clicks: 10,
    });
    assert.ok(row);
    assert.equal(row!.spend, 1.25);
    assert.equal(row!.impressions, 1000);
    assert.equal(row!.clicks, 10);
    assert.equal(row!.skippedUnverifiedSpendKey, false);
    assert.equal(pickFirstNumber({ hits: 5 }, TF_IMPRESSION_KEYS), null);
    assert.equal(pickFirstNumber({ value: 9 }, TF_SPEND_KEYS), null);
  });

  it("keeps spend/impressions null when only unverified keys exist", () => {
    const row = parseTrafficFactoryDailyStatRow({ date: "2026-10-01", campaign_id: "1", value: 4, hits: 9 });
    assert.ok(row);
    assert.equal(row!.spend, null);
    assert.equal(row!.impressions, null);
    assert.equal(row!.skippedUnverifiedSpendKey, true);
  });

  it("does not treat bare id as campaign id (account/row id ambiguity)", () => {
    const row = parseTrafficFactoryDailyStatRow({ date: "2026-10-01", id: 9001, cost: 2 });
    assert.ok(row);
    assert.equal(row!.campaignExternalId, null);
    assert.equal(row!.spend, 2);
  });

  it("rejects missing date", () => {
    assert.equal(parseTrafficFactoryDailyStatRow({ cost: 1, campaign_id: "1" }), null);
  });

  it("fetches /statistics/a/date with filters; account-level row has null campaign", async () => {
    const fetchFn: TfFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/statistics\/a\/date$/);
      assert.equal(url.searchParams.get("filter[date_from]"), "2026-10-01");
      assert.equal(url.searchParams.get("filter[date_to]"), "2026-10-07");
      return jsonResponse({
        result: [
          { date: "2026-10-01", campaign_id: "9", spend: 2, impressions: 50, clicks: 3 },
          { date: "2026-10-02", cost: 1, impressions: 10, clicks: 1 },
        ],
      });
    };
    const { items, pagesFetched } = await getTrafficFactoryDailyStats(
      "session",
      "2026-10-01",
      "2026-10-07",
      fetchFn
    );
    assert.equal(pagesFetched, 1);
    assert.equal(items.length, 2);
    assert.equal(items[0].campaignExternalId, "9");
    assert.equal(items[1].campaignExternalId, null);
  });

  it("surfaces HTTP failures", async () => {
    const fetchFn: TfFetch = async () => jsonResponse({ error: "nope" }, 500);
    await assert.rejects(
      () => getTrafficFactoryDailyStats("session", "2026-10-01", "2026-10-02", fetchFn),
      /Gagal mengambil \/statistics\/a\/date/
    );
  });
});
