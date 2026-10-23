/**
 * Confirmed against the live OpenAPI spec (docs.adsterratools.com/docs/public/v3/partners-api.yml,
 * rendered at docs.adsterratools.com/public/v3/partners-api — fetched directly rather than scraping
 * the rendered page, since the raw spec is authoritative and far cheaper to search).
 *
 * Auth: header `X-API-Key` (same key already used for balance/stats — confirmed from the spec's
 * securitySchemes, matches what this file already sent before this was written).
 * Every path takes a literal `.json` suffix (also `.xml`/`.csv` on some, but this app only uses json).
 * Error bodies are `{code, message, data: null}` — surfaced via `message` where present.
 */
const BASE_URL = "https://api3.adsterratools.com/advertiser";

export type AdsterraFetch = typeof fetch;

function authHeaders(apiKey: string): Record<string, string> {
  return { Accept: "application/json", "X-API-Key": apiKey };
}

function throwAdsterraHttpError(path: string, status: number, body: string): never {
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { message?: string };
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) message = parsed.message;
  } catch {
    // body wasn't JSON — keep the raw (truncated) text as the message
  }
  throw new Error(`Gagal ${path} Adsterra (${status}): ${message}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

async function adsterraRequest(
  apiKey: string,
  path: string,
  init: RequestInit | undefined,
  fetchFn: AdsterraFetch
): Promise<unknown> {
  const res = await fetchFn(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(apiKey), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throwAdsterraHttpError(path, res.status, text);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respons ${path} Adsterra bukan JSON: ${text.slice(0, 300)}`);
  }
}

export async function getAdsterraBalance(apiKey: string, fetchFn: AdsterraFetch = fetch): Promise<number | null> {
  const res = await fetchFn(`${BASE_URL}/balance.json`, { headers: authHeaders(apiKey) });
  if (!res.ok) return null;
  const data = (await res.json()) as { item?: string | number };
  const value = Number(data.item);
  return Number.isFinite(value) ? value : null;
}

export type AdsterraStatRow = Record<string, unknown>;

export async function getAdsterraStats(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  groupBy: string[],
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraStatRow[]> {
  const url = new URL(`${BASE_URL}/stats.json`);
  url.searchParams.set("start_date", dateFrom);
  url.searchParams.set("finish_date", dateTo);
  for (const g of groupBy) {
    url.searchParams.append("group_by[]", g);
  }

  const res = await fetchFn(url, { headers: authHeaders(apiKey) });
  if (!res.ok) throw new Error(`Gagal mengambil statistik Adsterra (${res.status})`);
  const data = (await res.json()) as { items?: AdsterraStatRow[] };
  return data.items ?? [];
}

/* ---------------------------------------------------------------------------------------------
 * Dictionaries — country/region/city/browser/OS/carrier/language ids needed to build targeting.
 * ------------------------------------------------------------------------------------------- */

export type AdsterraDictItem = { id: number; name: string };
export type AdsterraCountry = { id: number; name: string; code: string };
export type AdsterraBrowser = { id: number; name: string; deviceFormats: number[] };

function parseDictItems(data: unknown): AdsterraDictItem[] {
  const items = asRecord(data)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((r) => {
      const row = asRecord(r);
      const id = row ? Number(row.id) : NaN;
      const name = row && typeof row.name === "string" ? row.name : null;
      return Number.isFinite(id) && name ? { id, name } : null;
    })
    .filter((x): x is AdsterraDictItem => x !== null);
}

export async function getAdsterraCountries(apiKey: string, fetchFn: AdsterraFetch = fetch): Promise<AdsterraCountry[]> {
  const data = await adsterraRequest(apiKey, "/dictionary/countries.json", undefined, fetchFn);
  const items = asRecord(data)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((r) => {
      const row = asRecord(r);
      const id = row ? Number(row.id) : NaN;
      const name = row && typeof row.name === "string" ? row.name : null;
      const code = row && typeof row.code === "string" ? row.code : null;
      return Number.isFinite(id) && name && code ? { id, name, code } : null;
    })
    .filter((x): x is AdsterraCountry => x !== null);
}

export async function getAdsterraRegions(
  apiKey: string,
  countryId: number,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraDictItem[]> {
  const data = await adsterraRequest(apiKey, `/dictionary/country/${countryId}/regions.json`, undefined, fetchFn);
  return parseDictItems(data);
}

export async function getAdsterraCities(
  apiKey: string,
  countryId: number,
  regionId: number,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraDictItem[]> {
  const data = await adsterraRequest(
    apiKey,
    `/dictionary/country/${countryId}/region/${regionId}/cities.json`,
    undefined,
    fetchFn
  );
  return parseDictItems(data);
}

export async function getAdsterraCarriers(
  apiKey: string,
  countryId: number,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraDictItem[]> {
  const data = await adsterraRequest(apiKey, `/dictionary/carriers/${countryId}.json`, undefined, fetchFn);
  return parseDictItems(data);
}

export async function getAdsterraLanguages(apiKey: string, fetchFn: AdsterraFetch = fetch): Promise<AdsterraDictItem[]> {
  const data = await adsterraRequest(apiKey, "/dictionary/languages.json", undefined, fetchFn);
  return parseDictItems(data);
}

/** device_formats here is the numeric browser/OS-dictionary taxonomy (1-7, -1 "unknown"), a
 * DIFFERENT enum from the "desktop"/"mobile"/"tablet" strings create/update use — undocumented
 * beyond its examples (1 looked like desktop browsers, 3 like mobile), so rather than guess a
 * mapping, this always requests the full known range (1-7) to get the complete browser list. */
const ALL_BROWSER_DEVICE_FORMATS = [1, 2, 3, 4, 5, 6, 7];

export async function getAdsterraBrowsers(apiKey: string, fetchFn: AdsterraFetch = fetch): Promise<AdsterraBrowser[]> {
  const url = new URL(`${BASE_URL}/dictionary/browsers.json`);
  for (const f of ALL_BROWSER_DEVICE_FORMATS) url.searchParams.append("device_formats[]", String(f));
  const res = await fetchFn(url, { headers: authHeaders(apiKey) });
  const text = await res.text();
  if (!res.ok) throwAdsterraHttpError("/dictionary/browsers.json", res.status, text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /dictionary/browsers.json Adsterra bukan JSON: ${text.slice(0, 300)}`);
  }
  const items = asRecord(data)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((r) => {
      const row = asRecord(r);
      const id = row ? Number(row.id) : NaN;
      const name = row && typeof row.name === "string" ? row.name : null;
      const deviceFormats = Array.isArray(row?.device_formats)
        ? row.device_formats.filter((d): d is number => typeof d === "number")
        : [];
      return Number.isFinite(id) && name ? { id, name, deviceFormats } : null;
    })
    .filter((x): x is AdsterraBrowser => x !== null);
}

/** 1/2/3 inferred to line up with the create/update device_format order (desktop/mobile/tablet) —
 * the spec documents the enum values but not their meaning, so this is a judgment call, not
 * confirmed. Flag to the user if Windows/Mac OS X ever show up under the wrong device tab. */
export async function getAdsterraOperatingSystems(
  apiKey: string,
  deviceFormat: 1 | 2 | 3,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraDictItem[]> {
  const data = await adsterraRequest(
    apiKey,
    `/dictionary/operating-systems.json?device_format=${deviceFormat}`,
    undefined,
    fetchFn
  );
  return parseDictItems(data);
}

/* ---------------------------------------------------------------------------------------------
 * Campaigns — confirmed live: POST /campaign/request only accepts ad_unit_category "Popunder"
 * and pricing_type "CPM" (enum of exactly one value each in the spec) — every other ad format
 * Adsterra sells (Social Bar, In-Page Push, Interstitial) has no create/update API, only Popunder.
 * New campaigns go through moderation: POST returns a campaign_request_id, not a campaign — poll
 * GET /campaign/request/{id} for Pending/Approved/Declined, and only Approved carries a real
 * campaign_id usable with every other endpoint below.
 * ------------------------------------------------------------------------------------------- */

export type AdsterraCampaignInfo = {
  id: number;
  alias: string | null;
  /** 1 inactive, 2 inactive by limits, 3 active, 4 not in use. */
  active: number | null;
  format: string | null;
  pricingType: string | null;
  pricingSettings: { price: number; countryCode: string }[];
  totalBudgetLimit: number | null;
  dailyBudgetLimit: number | null;
  hourlyBudgetLimit: number | null;
  totalImpressionsLimit: number | null;
  dailyImpressionsLimit: number | null;
  hourlyImpressionsLimit: number | null;
  totalClicksLimit: number | null;
  dailyClicksLimit: number | null;
  hourlyClicksLimit: number | null;
  totalConversionsLimit: number | null;
  dailyConversionsLimit: number | null;
  hourlyConversionsLimit: number | null;
};

function num(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCampaignInfo(row: Record<string, unknown>): AdsterraCampaignInfo {
  const pricingSettings = Array.isArray(row.pricing_settings)
    ? row.pricing_settings
        .map((p) => {
          const r = asRecord(p);
          const price = r ? num(r, "price") : null;
          const countryCode = r && typeof r.country_code === "string" ? r.country_code : null;
          return price !== null && countryCode ? { price, countryCode } : null;
        })
        .filter((x): x is { price: number; countryCode: string } => x !== null)
    : [];

  return {
    id: num(row, "id") ?? 0,
    alias: typeof row.alias === "string" ? row.alias : null,
    active: num(row, "active"),
    format: typeof row.format === "string" ? row.format : null,
    pricingType: typeof row.pricing_type === "string" ? row.pricing_type : null,
    pricingSettings,
    totalBudgetLimit: num(row, "total_budget_limit"),
    dailyBudgetLimit: num(row, "daily_budget_limit"),
    hourlyBudgetLimit: num(row, "hourly_budget_limit"),
    totalImpressionsLimit: num(row, "total_impressions_limit"),
    dailyImpressionsLimit: num(row, "daily_impressions_limit"),
    hourlyImpressionsLimit: num(row, "hourly_impressions_limit"),
    totalClicksLimit: num(row, "total_clicks_limit"),
    dailyClicksLimit: num(row, "daily_clicks_limit"),
    hourlyClicksLimit: num(row, "hourly_clicks_limit"),
    totalConversionsLimit: num(row, "total_conversions_limit"),
    dailyConversionsLimit: num(row, "daily_conversions_limit"),
    hourlyConversionsLimit: num(row, "hourly_conversions_limit"),
  };
}

export async function listAdsterraCampaigns(apiKey: string, fetchFn: AdsterraFetch = fetch): Promise<AdsterraCampaignInfo[]> {
  const data = await adsterraRequest(apiKey, "/campaigns.json", undefined, fetchFn);
  const items = asRecord(data)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((r) => parseCampaignInfo(asRecord(r) ?? {}));
}

/** Status-level only — confirmed live this does NOT return name/targeting/landing URL/device etc,
 * just active state, pricing type, and budget/impression/click/conversion limits. There is no
 * Adsterra endpoint that returns a campaign's full targeting configuration back; only what was
 * just submitted is known, until the API adds one. */
export async function getAdsterraCampaign(
  apiKey: string,
  campaignId: number,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraCampaignInfo> {
  const data = await adsterraRequest(apiKey, `/campaign/${campaignId}.json`, undefined, fetchFn);
  return parseCampaignInfo(asRecord(data) ?? {});
}

export type AdsterraBidInput = { countryId: number; price: number };
export type AdsterraCustomBidInput = { price: number; countryId: number; placementId: number };
export type AdsterraBrowserTarget = { browser: number; rule: number; version: number; include: boolean };
export type AdsterraOsTarget = { os: number; rule: number; version: number; include: boolean };
export type AdsterraLocationTarget = { countryId: number; regionId: number; cityId: number; include: boolean };
export type AdsterraCarrierTarget = { include: boolean; country: number; carriers: { id: number; name: string }[] };
export type AdsterraTimeRangeTarget = { include: boolean; from: number; to: number };
export type AdsterraDayOfWeekTarget = { include: boolean; days: number[] };
export type AdsterraLanguageTarget = { include: boolean; languages: number[] };
export type AdsterraCpaGoal = { conditionValue: number; conditionOperator: number; optimizationParameter: number; gross: number };

/** Shared by create and update — every field optional so update can send a partial PATCH, same
 * pattern as the other integrations in this app. name/deviceFormat/trafficType/connectionType/
 * landingUrl/bids/startOption are required only at create time (enforced by the caller, not here). */
export type AdsterraCampaignFields = {
  name?: string;
  deviceFormat?: ("desktop" | "mobile" | "tablet")[];
  trafficType?: "All" | "Adult" | "Mainstream";
  connectionType?: "All" | "3G" | "Wi-Fi";
  landingUrl?: string;
  landingPreviews?: string[];
  bids?: AdsterraBidInput[];
  customBids?: AdsterraCustomBidInput[];
  isSmartCpm?: boolean;
  isEvenlyDistributed?: boolean;
  startOption?: 1 | 2 | 3;
  date?: string;
  time?: string;
  totalBudgetLimit?: number;
  dailyBudgetLimit?: number;
  hourlyBudgetLimit?: number;
  totalImpressionsLimit?: number;
  dailyImpressionsLimit?: number;
  hourlyImpressionsLimit?: number;
  frequencyCappingAmount?: number;
  frequencyCappingPeriod?: number;
  frequencyCappingPeriodType?: 1 | 2;
  browserTargets?: AdsterraBrowserTarget[];
  osTargets?: AdsterraOsTarget[];
  locationTargets?: AdsterraLocationTarget[];
  carrierTargets?: AdsterraCarrierTarget[];
  ipList?: string[];
  cpaGoal?: AdsterraCpaGoal;
  timeRangeTargets?: AdsterraTimeRangeTarget[];
  dayOfWeekTargets?: AdsterraDayOfWeekTarget;
  languageTargets?: AdsterraLanguageTarget;
};

function buildCampaignBody(input: AdsterraCampaignFields): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.deviceFormat !== undefined) body.device_format = input.deviceFormat;
  if (input.trafficType !== undefined) body.traffic_type = input.trafficType;
  if (input.connectionType !== undefined) body.connection_type = input.connectionType;
  if (input.landingUrl !== undefined) body.landing_url = input.landingUrl;
  if (input.landingPreviews !== undefined && input.landingPreviews.length > 0) body.landing_previews = input.landingPreviews;
  if (input.bids !== undefined) body.bids = input.bids.map((b) => ({ country_id: b.countryId, price: b.price }));
  if (input.customBids !== undefined && input.customBids.length > 0) {
    body.custom_bids = input.customBids.map((c) => ({ price: c.price, country_id: c.countryId, placement_id: c.placementId }));
  }
  if (input.isSmartCpm !== undefined) body.is_smart_cpm = input.isSmartCpm;
  if (input.isEvenlyDistributed !== undefined) body.is_evenly_distributed = input.isEvenlyDistributed;
  if (input.startOption !== undefined) body.start_option = input.startOption;
  if (input.date !== undefined) body.date = input.date;
  if (input.time !== undefined) body.time = input.time;
  // Confirmed live pattern (same footgun fixed for Traffic Factory): 0 means "unlimited" to the
  // UI, but these are plain optional numbers here with no documented minimum — still only send a
  // positive value so a blank field never gets literally sent as 0.
  if (input.totalBudgetLimit !== undefined && input.totalBudgetLimit > 0) body.total_budget_limit = input.totalBudgetLimit;
  if (input.dailyBudgetLimit !== undefined && input.dailyBudgetLimit > 0) body.daily_budget_limit = input.dailyBudgetLimit;
  if (input.hourlyBudgetLimit !== undefined && input.hourlyBudgetLimit > 0) body.hourly_budget_limit = input.hourlyBudgetLimit;
  if (input.totalImpressionsLimit !== undefined && input.totalImpressionsLimit > 0) {
    body.total_impressions_limit = input.totalImpressionsLimit;
  }
  if (input.dailyImpressionsLimit !== undefined && input.dailyImpressionsLimit > 0) {
    body.daily_impressions_limit = input.dailyImpressionsLimit;
  }
  if (input.hourlyImpressionsLimit !== undefined && input.hourlyImpressionsLimit > 0) {
    body.hourly_impressions_limit = input.hourlyImpressionsLimit;
  }
  if (input.frequencyCappingAmount !== undefined) body.frequency_capping_amount = input.frequencyCappingAmount;
  if (input.frequencyCappingPeriod !== undefined) body.frequency_capping_period = input.frequencyCappingPeriod;
  if (input.frequencyCappingPeriodType !== undefined) body.frequency_capping_period_type = input.frequencyCappingPeriodType;
  if (input.browserTargets !== undefined && input.browserTargets.length > 0) {
    body.browser_targets = input.browserTargets.map((t) => ({ browser: t.browser, rule: t.rule, version: t.version, include: t.include }));
  }
  if (input.osTargets !== undefined && input.osTargets.length > 0) {
    body.os_targets = input.osTargets.map((t) => ({ os: t.os, rule: t.rule, version: t.version, include: t.include }));
  }
  if (input.locationTargets !== undefined && input.locationTargets.length > 0) {
    body.location_targets = input.locationTargets.map((t) => ({
      country_id: t.countryId,
      region_id: t.regionId,
      city_id: t.cityId,
      include: t.include,
    }));
  }
  if (input.carrierTargets !== undefined && input.carrierTargets.length > 0) {
    body.carrier_targets = input.carrierTargets.map((t) => ({ include: t.include, country: t.country, carriers: t.carriers }));
  }
  if (input.ipList !== undefined && input.ipList.length > 0) body.ip_list = input.ipList;
  if (input.cpaGoal !== undefined) {
    body.cpa_goal = {
      condition_value: input.cpaGoal.conditionValue,
      condition_operator: input.cpaGoal.conditionOperator,
      optimization_parameter: input.cpaGoal.optimizationParameter,
      gross: input.cpaGoal.gross,
    };
  }
  if (input.timeRangeTargets !== undefined && input.timeRangeTargets.length > 0) {
    body.time_range_targets = input.timeRangeTargets.map((t) => ({ include: t.include, from: t.from, to: t.to }));
  }
  if (input.dayOfWeekTargets !== undefined) {
    body.day_of_week_targets = { include: input.dayOfWeekTargets.include, days: input.dayOfWeekTargets.days };
  }
  if (input.languageTargets !== undefined) {
    body.language_targets = { include: input.languageTargets.include, languages: input.languageTargets.languages };
  }
  return body;
}

export type CreateAdsterraCampaignInput = AdsterraCampaignFields & {
  name: string;
  deviceFormat: ("desktop" | "mobile" | "tablet")[];
  trafficType: "All" | "Adult" | "Mainstream";
  connectionType: "All" | "3G" | "Wi-Fi";
  landingUrl: string;
  bids: AdsterraBidInput[];
  startOption: 1 | 2 | 3;
};

/** POST /campaign/request — ad_unit_category/pricing_type are hardcoded here (Popunder/CPM are
 * the only values the API accepts, confirmed from the spec's enum), not exposed as input. Returns
 * a request id, not a campaign — the campaign only exists after moderation approves it. */
export async function createAdsterraCampaignRequest(
  apiKey: string,
  input: CreateAdsterraCampaignInput,
  fetchFn: AdsterraFetch = fetch
): Promise<{ campaignRequestId: string }> {
  const body = { ...buildCampaignBody(input), ad_unit_category: "Popunder", pricing_type: "CPM" };
  const data = await adsterraRequest(
    apiKey,
    "/campaign/request.json",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    fetchFn
  );
  const row = asRecord(data);
  const campaignRequestId = row && typeof row.campaign_request_id === "string" ? row.campaign_request_id : null;
  if (!campaignRequestId) {
    throw new Error(`Respons /campaign/request Adsterra tidak terduga: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return { campaignRequestId };
}

export type AdsterraCampaignRequestStatus = {
  status: "Pending" | "Approved" | "Declined";
  campaignId: number | null;
  declineReason: string | null;
};

export async function getAdsterraCampaignRequestStatus(
  apiKey: string,
  campaignRequestId: string,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraCampaignRequestStatus> {
  const data = await adsterraRequest(apiKey, `/campaign/request/${campaignRequestId}.json`, undefined, fetchFn);
  const row = asRecord(data);
  const status = row && typeof row.status === "string" ? row.status : null;
  if (status !== "Pending" && status !== "Approved" && status !== "Declined") {
    throw new Error(`Status campaign request Adsterra tidak terduga: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return {
    status,
    campaignId: row ? num(row, "campaign_id") : null,
    declineReason: row && typeof row.decline_reason === "string" ? row.decline_reason : null,
  };
}

/** PATCH /campaign/{id}/update — partial update, no required fields. */
export async function updateAdsterraCampaign(
  apiKey: string,
  campaignId: number,
  input: AdsterraCampaignFields,
  fetchFn: AdsterraFetch = fetch
): Promise<void> {
  const body = buildCampaignBody(input);
  await adsterraRequest(
    apiKey,
    `/campaign/${campaignId}/update.json`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    fetchFn
  );
}

export type AdsterraPricingSetting = { countryId: number; price: number };

export async function getAdsterraPricingSettings(
  apiKey: string,
  campaignId: number,
  fetchFn: AdsterraFetch = fetch
): Promise<AdsterraPricingSetting[]> {
  const data = await adsterraRequest(apiKey, `/campaign/${campaignId}/pricing_settings.json`, undefined, fetchFn);
  const items = asRecord(data)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((r) => {
      const row = asRecord(r);
      const countryId = row ? num(row, "country_id") : null;
      const price = row ? num(row, "price") : null;
      return countryId !== null && price !== null ? { countryId, price } : null;
    })
    .filter((x): x is AdsterraPricingSetting => x !== null);
}

/** PUT — replaces the FULL list of base GEO bids for the campaign, not a partial merge. */
export async function replaceAdsterraPricingSettings(
  apiKey: string,
  campaignId: number,
  settings: AdsterraPricingSetting[],
  fetchFn: AdsterraFetch = fetch
): Promise<void> {
  const body = { items: settings.map((s) => ({ country_id: s.countryId, price: s.price })) };
  await adsterraRequest(
    apiKey,
    `/campaign/${campaignId}/pricing_settings.json`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    fetchFn
  );
}
