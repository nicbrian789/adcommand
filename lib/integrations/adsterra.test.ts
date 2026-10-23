import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAdsterraCampaignRequest,
  getAdsterraBalance,
  getAdsterraBrowsers,
  getAdsterraCampaign,
  getAdsterraCampaignRequestStatus,
  getAdsterraCarriers,
  getAdsterraCities,
  getAdsterraCountries,
  getAdsterraLanguages,
  getAdsterraOperatingSystems,
  getAdsterraOperatingSystemVersions,
  getAdsterraBrowserVersions,
  getAdsterraPricingSettings,
  getAdsterraRegions,
  getAdsterraStats,
  listAdsterraCampaigns,
  replaceAdsterraPricingSettings,
  updateAdsterraCampaign,
  type AdsterraFetch,
} from "./adsterra";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("Adsterra auth + stats (existing behavior, unchanged)", () => {
  it("sends X-API-Key and parses balance.item", async () => {
    const fetchFn: AdsterraFetch = async (input, init) => {
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers["X-API-Key"], "key123");
      assert.match(String(input), /\/balance\.json$/);
      return jsonResponse({ item: "42.50" });
    };
    const balance = await getAdsterraBalance("key123", fetchFn);
    assert.equal(balance, 42.5);
  });

  it("returns null balance on non-ok response rather than throwing", async () => {
    const fetchFn: AdsterraFetch = async () => new Response("", { status: 401 });
    assert.equal(await getAdsterraBalance("key123", fetchFn), null);
  });

  it("fetches stats with start_date/finish_date and repeated group_by[]", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("start_date"), "2026-10-01");
      assert.equal(url.searchParams.get("finish_date"), "2026-10-21");
      assert.deepEqual(url.searchParams.getAll("group_by[]"), ["date", "campaign"]);
      return jsonResponse({ items: [{ date: "2026-10-01", campaign: 1 }] });
    };
    const rows = await getAdsterraStats("key123", "2026-10-01", "2026-10-21", ["date", "campaign"], fetchFn);
    assert.equal(rows.length, 1);
  });
});

describe("Adsterra dictionaries", () => {
  it("parses countries with id/name/code", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/countries\.json$/);
      return jsonResponse({ items: [{ id: 109, name: "Jamaica", code: "JM" }] });
    };
    const countries = await getAdsterraCountries("key", fetchFn);
    assert.deepEqual(countries, [{ id: 109, name: "Jamaica", code: "JM" }]);
  });

  it("fetches regions scoped to a country id", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/country\/6\/regions\.json$/);
      return jsonResponse({ items: [{ id: 1624, name: "England" }] });
    };
    assert.deepEqual(await getAdsterraRegions("key", 6, fetchFn), [{ id: 1624, name: "England" }]);
  });

  it("fetches cities scoped to a country+region id", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/country\/6\/region\/1624\/cities\.json$/);
      return jsonResponse({ items: [{ id: 2643743, name: "London" }] });
    };
    assert.deepEqual(await getAdsterraCities("key", 6, 1624, fetchFn), [{ id: 2643743, name: "London" }]);
  });

  it("fetches carriers scoped to a country id", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/carriers\/6\.json$/);
      return jsonResponse({ items: [{ id: 7, name: "AT&T" }] });
    };
    assert.deepEqual(await getAdsterraCarriers("key", 6, fetchFn), [{ id: 7, name: "AT&T" }]);
  });

  it("fetches the flat language dictionary", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/languages\.json$/);
      return jsonResponse({ items: [{ id: 1, name: "Albanian" }] });
    };
    assert.deepEqual(await getAdsterraLanguages("key", fetchFn), [{ id: 1, name: "Albanian" }]);
  });

  it("requests browsers across the full device_formats[] range (1-7) to get the complete list", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      const url = new URL(String(input));
      assert.deepEqual(url.searchParams.getAll("device_formats[]"), ["1", "2", "3", "4", "5", "6", "7"]);
      return jsonResponse({ items: [{ id: 5, name: "Chrome", device_formats: [1] }] });
    };
    assert.deepEqual(await getAdsterraBrowsers("key", fetchFn), [{ id: 5, name: "Chrome", deviceFormats: [1] }]);
  });

  it("fetches the full unfiltered OS list (device_format omitted rather than guessing the 1/2/3 mapping)", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      const url = new URL(String(input));
      assert.match(url.pathname, /\/dictionary\/operating-systems\.json$/);
      assert.equal(url.searchParams.has("device_format"), false);
      return jsonResponse({ items: [{ id: 12, name: "Android" }] });
    };
    assert.deepEqual(await getAdsterraOperatingSystems("key", fetchFn), [{ id: 12, name: "Android" }]);
  });

  it("fetches versions scoped to a browser id", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/browser\/5\/versions\.json$/);
      return jsonResponse({ items: [{ id: 145, name: "6.0" }] });
    };
    assert.deepEqual(await getAdsterraBrowserVersions("key", 5, fetchFn), [{ id: 145, name: "6.0" }]);
  });

  it("fetches versions scoped to an operating system id", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/dictionary\/operating-system\/4\/versions\.json$/);
      return jsonResponse({ items: [{ id: 11, name: "7" }] });
    };
    assert.deepEqual(await getAdsterraOperatingSystemVersions("key", 4, fetchFn), [{ id: 11, name: "7" }]);
  });
});

describe("Adsterra campaign create (via moderation request) + status polling", () => {
  it("creates a campaign request with Popunder/CPM hardcoded, only sending fields actually provided", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: AdsterraFetch = async (input, init) => {
      assert.match(String(input), /\/campaign\/request\.json$/);
      assert.equal(init?.method, "POST");
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({ campaign_request_id: "795733" });
    };
    const result = await createAdsterraCampaignRequest(
      "key",
      {
        name: "Test Campaign",
        deviceFormat: ["desktop"],
        trafficType: "All",
        connectionType: "All",
        landingUrl: "https://example.com",
        bids: [{ countryId: 6, price: 1.25 }],
        startOption: 1,
      },
      fetchFn
    );
    assert.equal(result.campaignRequestId, "795733");
    assert.deepEqual(capturedBody, {
      name: "Test Campaign",
      device_format: ["desktop"],
      traffic_type: "All",
      connection_type: "All",
      landing_url: "https://example.com",
      bids: [{ country_id: 6, price: 1.25 }],
      start_option: 1,
      ad_unit_category: "Popunder",
      pricing_type: "CPM",
    });
  });

  it("includes optional targeting/budget fields only when actually provided", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: AdsterraFetch = async (input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({ campaign_request_id: "1" });
    };
    await createAdsterraCampaignRequest(
      "key",
      {
        name: "Test",
        deviceFormat: ["mobile", "tablet"],
        trafficType: "Adult",
        connectionType: "Wi-Fi",
        landingUrl: "https://example.com/offer",
        bids: [{ countryId: 6, price: 1 }],
        startOption: 2,
        date: "2026-11-01",
        time: "09:00",
        totalBudgetLimit: 500,
        dailyBudgetLimit: 50,
        browserTargets: [{ browser: 5, rule: 0, version: 10, include: true }],
        osTargets: [{ os: 2, rule: 2, version: 4, include: true }],
        locationTargets: [{ countryId: 6, regionId: 1624, cityId: 0, include: true }],
        carrierTargets: [{ include: true, country: 6, carriers: [{ id: 7, name: "AT&T" }] }],
        ipList: ["192.168.1.1"],
        timeRangeTargets: [{ include: true, from: 9, to: 17 }],
        dayOfWeekTargets: { include: true, days: [1, 2, 3] },
        languageTargets: { include: true, languages: [1, 2] },
        cpaGoal: { conditionValue: 10, conditionOperator: 1, optimizationParameter: 1, gross: 1.25 },
        isSmartCpm: true,
      },
      fetchFn
    );
    assert.deepEqual(capturedBody, {
      name: "Test",
      device_format: ["mobile", "tablet"],
      traffic_type: "Adult",
      connection_type: "Wi-Fi",
      landing_url: "https://example.com/offer",
      bids: [{ country_id: 6, price: 1 }],
      start_option: 2,
      date: "2026-11-01",
      time: "09:00",
      total_budget_limit: 500,
      daily_budget_limit: 50,
      browser_targets: [{ browser: 5, rule: 0, version: 10, include: true }],
      os_targets: [{ os: 2, rule: 2, version: 4, include: true }],
      location_targets: [{ country_id: 6, region_id: 1624, city_id: 0, include: true }],
      carrier_targets: [{ include: true, country: 6, carriers: [{ id: 7, name: "AT&T" }] }],
      ip_list: ["192.168.1.1"],
      time_range_targets: [{ include: true, from: 9, to: 17 }],
      day_of_week_targets: { include: true, days: [1, 2, 3] },
      language_targets: { include: true, languages: [1, 2] },
      cpa_goal: { condition_value: 10, condition_operator: 1, optimization_parameter: 1, gross: 1.25 },
      is_smart_cpm: true,
      ad_unit_category: "Popunder",
      pricing_type: "CPM",
    });
  });

  it("throws a diagnosable error when the create response has no campaign_request_id", async () => {
    const fetchFn: AdsterraFetch = async () => jsonResponse({ unexpected: true });
    await assert.rejects(
      () =>
        createAdsterraCampaignRequest(
          "key",
          {
            name: "Test",
            deviceFormat: ["desktop"],
            trafficType: "All",
            connectionType: "All",
            landingUrl: "https://example.com",
            bids: [{ countryId: 6, price: 1 }],
            startOption: 1,
          },
          fetchFn
        ),
      /tidak terduga/
    );
  });

  it("polls campaign request status, surfacing Pending/Approved/Declined with campaign_id or decline_reason", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/campaign\/request\/795733\.json$/);
      return jsonResponse({ status: "Approved", campaign_id: 1204674 });
    };
    const result = await getAdsterraCampaignRequestStatus("key", "795733", fetchFn);
    assert.deepEqual(result, { status: "Approved", campaignId: 1204674, declineReason: null });
  });

  it("surfaces a decline reason when the request was declined", async () => {
    const fetchFn: AdsterraFetch = async () => jsonResponse({ status: "Declined", decline_reason: "Advertiser's request" });
    const result = await getAdsterraCampaignRequestStatus("key", "795733", fetchFn);
    assert.deepEqual(result, { status: "Declined", campaignId: null, declineReason: "Advertiser's request" });
  });

  it("surfaces the real {message} from a 4xx error body instead of the raw JSON", async () => {
    const fetchFn: AdsterraFetch = async () => jsonResponse({ code: 422, message: "Validation failed.", data: null }, 422);
    await assert.rejects(
      () =>
        createAdsterraCampaignRequest(
          "key",
          {
            name: "Test",
            deviceFormat: ["desktop"],
            trafficType: "All",
            connectionType: "All",
            landingUrl: "https://example.com",
            bids: [{ countryId: 6, price: 1 }],
            startOption: 1,
          },
          fetchFn
        ),
      /Validation failed\./
    );
  });
});

describe("Adsterra campaign list/detail/update (status-level only, confirmed live)", () => {
  it("lists campaigns, mapping active/format/pricing + every limit field", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/campaigns\.json$/);
      return jsonResponse({
        items: [
          {
            id: 642477884,
            alias: "Some_alias",
            active: 3,
            format: "pu",
            pricing_type: "CPM",
            pricing_settings: [{ price: 0.35, country_code: "US" }],
            total_budget_limit: 100,
            daily_budget_limit: 10,
            hourly_budget_limit: 0,
            total_impressions_limit: 10,
            daily_impressions_limit: 5,
            hourly_impressions_limit: 0,
            total_clicks_limit: 0,
            daily_clicks_limit: 0,
            hourly_clicks_limit: 2,
            total_conversions_limit: 2,
            daily_conversions_limit: 2,
            hourly_conversions_limit: 2,
          },
        ],
        itemCount: 1,
      });
    };
    const campaigns = await listAdsterraCampaigns("key", fetchFn);
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].id, 642477884);
    assert.equal(campaigns[0].alias, "Some_alias");
    assert.equal(campaigns[0].active, 3);
    assert.deepEqual(campaigns[0].pricingSettings, [{ price: 0.35, countryCode: "US" }]);
  });

  it("gets a single campaign's status-level info (no name/targeting — confirmed not present live)", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/campaign\/642477987\.json$/);
      return jsonResponse({ id: 642477987, alias: "Some_alias_2", active: 1, format: "nv", pricing_type: "CPC" });
    };
    const campaign = await getAdsterraCampaign("key", 642477987, fetchFn);
    assert.equal(campaign.id, 642477987);
    assert.equal(campaign.active, 1);
  });

  it("sends a partial PATCH body, omitting fields that weren't provided", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: AdsterraFetch = async (input, init) => {
      assert.match(String(input), /\/campaign\/642477987\/update\.json$/);
      assert.equal(init?.method, "PATCH");
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateAdsterraCampaign("key", 642477987, { name: "New Name", dailyBudgetLimit: 25 }, fetchFn);
    assert.deepEqual(capturedBody, { name: "New Name", daily_budget_limit: 25 });
  });

  it("omits budget/impression limit fields given as 0, same blank-means-unlimited footgun as Traffic Factory", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: AdsterraFetch = async (input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response("", { status: 200 });
    };
    await updateAdsterraCampaign(
      "key",
      1,
      { name: "X", totalBudgetLimit: 0, dailyBudgetLimit: 0, totalImpressionsLimit: 0 },
      fetchFn
    );
    assert.deepEqual(capturedBody, { name: "X" });
  });
});

describe("Adsterra pricing settings (per-country bids, readable back unlike other targeting)", () => {
  it("reads the base GEO bid list for a campaign", async () => {
    const fetchFn: AdsterraFetch = async (input) => {
      assert.match(String(input), /\/campaign\/1\/pricing_settings\.json$/);
      return jsonResponse({ items: [{ country_id: 6, price: 1.25 }], itemCount: 1 });
    };
    assert.deepEqual(await getAdsterraPricingSettings("key", 1, fetchFn), [{ countryId: 6, price: 1.25 }]);
  });

  it("replaces the full bid list via PUT", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn: AdsterraFetch = async (input, init) => {
      assert.match(String(input), /\/campaign\/1\/pricing_settings\.json$/);
      assert.equal(init?.method, "PUT");
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({ items: [] });
    };
    await replaceAdsterraPricingSettings(
      "key",
      1,
      [
        { countryId: 6, price: 1.25 },
        { countryId: 109, price: 0.75 },
      ],
      fetchFn
    );
    assert.deepEqual(capturedBody, {
      items: [
        { country_id: 6, price: 1.25 },
        { country_id: 109, price: 0.75 },
      ],
    });
  });
});
