/**
 * Traffic Factory API v2 connector.
 *
 * Auth (POST /v2/login): body { api_token } -> { token, type, expires_in, refresh_token }.
 * Subsequent requests use Authorization: Bearer <token> (the access token, not refresh_token).
 *
 * /statistics/a/{date|country} are fixed-dimension endpoints, not one generic endpoint with
 * arbitrary group_by[]. Confirmed against the live Swagger docs (api.trafficfactory.com/v2/docs):
 *  - date field on /statistics/a/date is "ddate"; impressions field is "hits"
 *  - query params are hyphenated "date-from"/"date-to" (not filter[date_from] or date_from)
 *  - "additional_group_by=campaign" is required to get a per-row campaign id at all
 *  - pagination (here and on /campaigns) is "limit"/"offset" (request_metadata echoes them back),
 *    not "page"/"per_page"
 *  - /statistics/a/country has no per-day granularity (one total per date range), so callers that
 *    need a daily geo breakdown must call it once per day
 *  - field naming elsewhere in the API follows "id<entity>" (idgroup, idgoal, idad_exchange_partner),
 *    so a campaign id on a grouped stats row may show up as "idcampaign" rather than "campaign_id"
 *
 * Network I/O is injectable via fetchFn so this file can be unit tested without live calls.
 */

export const TRAFFIC_FACTORY_BASE_URL = "https://api.trafficfactory.com/v2";

/** Official schema: `cost` = campaign cost. `value` is also labeled "costs" but its units
 * vs `cost` are unverified — never map it to spend without confirming against a live response. */
export const TF_SPEND_KEYS = ["cost", "spend", "spending"] as const;
export const TF_IMPRESSION_KEYS = ["impressions", "impression", "hits"] as const;
export const TF_CLICK_KEYS = ["clicks", "click"] as const;
/** Balance only — `funds`/`credit` omitted (semantics unverified). */
export const TF_BALANCE_KEYS = ["balance", "account_balance"] as const;
export const TF_CURRENCY_KEYS = ["currency", "currency_code"] as const;
const TF_CAMPAIGN_ID_KEYS = ["idcampaign", "campaign_id", "campaignId"] as const;
const TF_COUNTRY_KEYS = ["country", "country_code"] as const;

export type TfFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type TrafficFactoryStatRow = Record<string, unknown>;

export type TrafficFactoryUserInfo = {
  balance: number | null;
  /** Parsed when present; not persisted — ad_networks has no currency column. */
  currency: string | null;
  rawKeys: string[];
};

export type TrafficFactoryCampaign = {
  externalId: string;
  name: string;
  status: string;
};

export type PaginatedResult<T> = {
  items: T[];
  pagesFetched: number;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 50;

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
}

function throwTrafficFactoryHttpError(path: string, status: number, body: string): never {
  if (status === 401 || status === 403) {
    throw new Error(
      `Sesi/akses Traffic Factory ditolak (${status}) pada ${path}. Token akses mungkin kedaluwarsa atau API token tidak valid. Respons: ${body.slice(0, 200)}`
    );
  }
  throw new Error(`Gagal mengambil ${path} Traffic Factory (${status}). Respons: ${body.slice(0, 300)}`);
}

export function pickFirstNumber(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (!(key in row) || row[key] == null || row[key] === "") continue;
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function pickFirstString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Unwrap common list envelopes used by TF-style JSON APIs (campaigns, etc.). */
export function unwrapList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
  }
  const record = asRecord(data);
  if (!record) return [];
  for (const key of ["result", "data", "items", "campaigns", "rows", "statistics"]) {
    const v = record[key];
    if (Array.isArray(v)) {
      return v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
    }
  }
  if ("id" in record || "date" in record || "balance" in record) return [record];
  return [];
}

/**
 * Statistics payloads may include `resultTotal` (aggregate). Never treat it as a campaign row.
 * Official shape: { result: StatRow[], resultTotal?: { cost, hits, clicks, ... } }
 */
export function unwrapTrafficFactoryStatisticsPayload(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, unknown>[];
  }
  const record = asRecord(data);
  if (!record) return [];

  for (const key of ["result", "data", "items", "rows", "statistics"]) {
    const v = record[key];
    if (Array.isArray(v)) {
      return v.filter((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return false;
        const row = x as Record<string, unknown>;
        if (row === record.resultTotal) return false;
        return true;
      }) as Record<string, unknown>[];
    }
  }

  return [];
}

/** True when an object looks like resultTotal / aggregate, not a dated campaign row. */
export function isTrafficFactoryResultTotal(row: Record<string, unknown>): boolean {
  if ("date" in row || "ddate" in row || "stat_date" in row || "day" in row || "datetime" in row) return false;
  if (TF_CAMPAIGN_ID_KEYS.some((k) => k in row) || "campaign" in row) return false;
  return "cost" in row || "hits" in row || "clicks" in row || "value" in row;
}

export type TrafficFactoryLoginResult = {
  token: string;
  type: string | null;
  expiresIn: number | null;
  refreshToken: string | null;
};

/** Parse official login JSON. Prefer `token` (access); never return `refresh_token`. */
export function parseTrafficFactoryLoginResponse(text: string): TrafficFactoryLoginResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const stripped = text.replace(/^"|"$/g, "").trim();
    if (stripped) {
      return { token: stripped, type: null, expiresIn: null, refreshToken: null };
    }
    throw new Error(`Respons login Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }

  if (typeof data === "string" && data.trim()) {
    return { token: data.trim(), type: null, expiresIn: null, refreshToken: null };
  }

  const obj = asRecord(data);
  if (!obj) {
    throw new Error(`Tidak menemukan token di respons login Traffic Factory: ${text.slice(0, 300)}`);
  }

  const token = pickFirstString(obj, ["token", "access_token", "session_token"]);
  if (!token) {
    throw new Error(`Tidak menemukan token di respons login Traffic Factory: ${text.slice(0, 300)}`);
  }

  const type = pickFirstString(obj, ["type", "token_type"]);
  const expiresRaw = obj.expires_in ?? obj.expiresIn;
  const expiresIn =
    typeof expiresRaw === "number" && Number.isFinite(expiresRaw)
      ? expiresRaw
      : typeof expiresRaw === "string" && Number.isFinite(Number(expiresRaw))
        ? Number(expiresRaw)
        : null;
  const refreshToken = pickFirstString(obj, ["refresh_token", "refreshToken"]);

  return { token, type, expiresIn, refreshToken };
}

/** @deprecated Prefer parseTrafficFactoryLoginResponse; returns access token only. */
export function parseTrafficFactorySessionToken(text: string): string {
  return parseTrafficFactoryLoginResponse(text).token;
}

export async function getTrafficFactorySessionToken(apiToken: string, fetchFn: TfFetch = fetch): Promise<string> {
  const login = await loginTrafficFactory(apiToken, fetchFn);
  return login.token;
}

export async function loginTrafficFactory(apiToken: string, fetchFn: TfFetch = fetch): Promise<TrafficFactoryLoginResult> {
  const trimmed = apiToken.trim();
  if (!trimmed) {
    throw new Error("API token Traffic Factory kosong.");
  }

  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_token: trimmed }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Login Traffic Factory ditolak (${res.status}). Periksa API token. Respons: ${text.slice(0, 200)}`);
    }
    throw new Error(`Login Traffic Factory gagal (${res.status}). Respons: ${text.slice(0, 300)}`);
  }

  return parseTrafficFactoryLoginResponse(text);
}

/**
 * UI formats network balance as USD ($). Persist balance only when currency is missing
 * (unknown) or USD — never mix EUR/other into the same numeric field.
 */
export function canPersistTrafficFactoryBalance(currency: string | null): boolean {
  if (currency == null || currency.trim() === "") return true;
  return currency.trim().toUpperCase() === "USD";
}

export function parseTrafficFactoryUser(data: unknown): TrafficFactoryUserInfo {
  const roots: Record<string, unknown>[] = [];
  const top = asRecord(data);
  if (top) {
    roots.push(top);
    const nested = asRecord(top.user) ?? asRecord(top.account) ?? asRecord(top.data);
    if (nested) roots.push(nested);
  }

  let balance: number | null = null;
  let currency: string | null = null;
  const rawKeys = new Set<string>();

  for (const row of roots) {
    Object.keys(row).forEach((k) => rawKeys.add(k));
    if (balance === null) balance = pickFirstNumber(row, TF_BALANCE_KEYS);
    if (currency === null) currency = pickFirstString(row, TF_CURRENCY_KEYS);
  }

  return { balance, currency, rawKeys: [...rawKeys] };
}

export async function getTrafficFactoryUser(sessionToken: string, fetchFn: TfFetch = fetch): Promise<TrafficFactoryUserInfo> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/user`, { headers: authHeaders(sessionToken) });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError("/user", res.status, text);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /user Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  return parseTrafficFactoryUser(data);
}

/** Map TF campaign status strings/booleans into ADCOMMAND statuses. */
export function mapTrafficFactoryCampaignStatus(raw: unknown): string {
  if (typeof raw === "boolean") return raw ? "Running" : "Paused";
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "Draft";
  if (["enabled", "active", "running", "play", "playing", "true", "1"].includes(s)) return "Running";
  if (["paused", "pause", "suspended", "false", "0"].includes(s)) return "Paused";
  if (["stopped", "stop", "archived", "deleted", "disabled", "rejected"].includes(s)) return "Stopped";
  if (["draft", "pending", "moderation", "review"].includes(s)) return "Draft";
  return "Draft";
}

export function parseTrafficFactoryCampaign(row: Record<string, unknown>): TrafficFactoryCampaign | null {
  const id =
    pickFirstString(row, ["id", ...TF_CAMPAIGN_ID_KEYS]) ??
    (typeof row.campaign === "number" || typeof row.campaign === "string" ? String(row.campaign) : null);
  if (!id) return null;

  const name = pickFirstString(row, ["name", "campaign_name", "title", "label"]) ?? `Traffic Factory ${id}`;
  const statusRaw = row.status ?? row.state ?? row.campaign_status ?? row.enabled ?? row.active;

  return { externalId: id, name, status: mapTrafficFactoryCampaignStatus(statusRaw) };
}

/** Shared pager: limit/offset, confirmed on both /campaigns and /statistics/a/* via the live docs. */
async function fetchPaginatedRecords(
  sessionToken: string,
  path: string,
  extraParams: Record<string, string>,
  fetchFn: TfFetch,
  unwrap: (data: unknown) => Record<string, unknown>[] = unwrapList
): Promise<PaginatedResult<Record<string, unknown>>> {
  const items: Record<string, unknown>[] = [];
  let pagesFetched = 0;
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${TRAFFIC_FACTORY_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const res = await fetchFn(url, { headers: authHeaders(sessionToken) });
    const text = await res.text();
    if (!res.ok) {
      throwTrafficFactoryHttpError(path, res.status, text);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Respons ${path} Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
    }

    const batch = unwrap(data);
    pagesFetched += 1;
    items.push(...batch);

    if (batch.length < DEFAULT_PAGE_SIZE) break;
    offset += DEFAULT_PAGE_SIZE;
  }

  return { items, pagesFetched };
}

export async function listTrafficFactoryCampaigns(
  sessionToken: string,
  fetchFn: TfFetch = fetch
): Promise<PaginatedResult<TrafficFactoryCampaign>> {
  const { items, pagesFetched } = await fetchPaginatedRecords(sessionToken, "/campaigns", {}, fetchFn);
  const campaigns: TrafficFactoryCampaign[] = [];
  const seen = new Set<string>();
  for (const row of items) {
    const parsed = parseTrafficFactoryCampaign(row);
    if (!parsed || seen.has(parsed.externalId)) continue;
    seen.add(parsed.externalId);
    campaigns.push(parsed);
  }
  return { items: campaigns, pagesFetched };
}

export type ParsedDailyStat = {
  date: string;
  campaignExternalId: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  /** True when a spend-like key other than the allowlist appeared (not mapped). */
  skippedUnverifiedSpendKey: boolean;
};

function parseStatCampaignId(row: Record<string, unknown>): string | null {
  let id = pickFirstString(row, TF_CAMPAIGN_ID_KEYS);
  if (!id && row.campaign != null && typeof row.campaign !== "object") {
    id = String(row.campaign);
  }
  if (!id) {
    const nested = asRecord(row.campaign);
    if (nested) id = pickFirstString(nested, ["id", ...TF_CAMPAIGN_ID_KEYS]);
  }
  return id;
}

export function parseTrafficFactoryDailyStatRow(row: Record<string, unknown>): ParsedDailyStat | null {
  const dateRaw =
    pickFirstString(row, ["ddate", "date", "stat_date", "day"]) ??
    (typeof row.datetime === "string" ? row.datetime.slice(0, 10) : null);
  if (!dateRaw) return null;
  const date = dateRaw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  // Do NOT use bare `id` — on /statistics/a/date it may be a row id, not a campaign id.
  const campaignExternalId = parseStatCampaignId(row);

  const spend = pickFirstNumber(row, TF_SPEND_KEYS);
  const skippedUnverifiedSpendKey = "value" in row && spend === null;

  return {
    date,
    campaignExternalId,
    spend,
    impressions: pickFirstNumber(row, TF_IMPRESSION_KEYS),
    clicks: pickFirstNumber(row, TF_CLICK_KEYS),
    skippedUnverifiedSpendKey,
  };
}

/** Daily advertiser statistics: GET /statistics/a/date, grouped per campaign per day. */
export async function getTrafficFactoryDailyStats(
  sessionToken: string,
  dateFrom: string,
  dateTo: string,
  fetchFn: TfFetch = fetch
): Promise<PaginatedResult<ParsedDailyStat>> {
  const { items, pagesFetched } = await fetchPaginatedRecords(
    sessionToken,
    "/statistics/a/date",
    { "date-from": dateFrom, "date-to": dateTo, additional_group_by: "campaign" },
    fetchFn,
    unwrapTrafficFactoryStatisticsPayload
  );

  const parsed: ParsedDailyStat[] = [];
  for (const row of items) {
    if (isTrafficFactoryResultTotal(row)) continue;
    const p = parseTrafficFactoryDailyStatRow(row);
    if (p) parsed.push(p);
  }
  return { items: parsed, pagesFetched };
}

export type ParsedCountryStat = {
  country: string;
  campaignExternalId: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
};

export function parseTrafficFactoryCountryStatRow(row: Record<string, unknown>): ParsedCountryStat | null {
  const country = pickFirstString(row, TF_COUNTRY_KEYS);
  if (!country) return null;

  const spend = pickFirstNumber(row, TF_SPEND_KEYS);
  return {
    country,
    campaignExternalId: parseStatCampaignId(row),
    spend,
    impressions: pickFirstNumber(row, TF_IMPRESSION_KEYS),
    clicks: pickFirstNumber(row, TF_CLICK_KEYS),
  };
}

/**
 * Country breakdown: GET /statistics/a/country. This endpoint has no per-day granularity —
 * one total per date range — so callers needing a daily geo breakdown must pass dateFrom===dateTo
 * and call it once per day (see syncTrafficFactory in lib/networkSync.ts).
 */
export async function getTrafficFactoryCountryStats(
  sessionToken: string,
  dateFrom: string,
  dateTo: string,
  fetchFn: TfFetch = fetch
): Promise<ParsedCountryStat[]> {
  const { items } = await fetchPaginatedRecords(
    sessionToken,
    "/statistics/a/country",
    { "date-from": dateFrom, "date-to": dateTo, additional_group_by: "campaign" },
    fetchFn,
    unwrapTrafficFactoryStatisticsPayload
  );

  const parsed: ParsedCountryStat[] = [];
  for (const row of items) {
    if (isTrafficFactoryResultTotal(row)) continue;
    const p = parseTrafficFactoryCountryStatRow(row);
    if (p) parsed.push(p);
  }
  return parsed;
}

/**
 * Campaign create/edit/pause/delete.
 *
 * Confirmed against the live swagger.json (api.trafficfactory.com/v2/docs/swagger.json):
 *  - POST /campaigns requires: name, advertiser_ad_type, media_storage_template, countries,
 *    categories. Its 200 response isn't documented (only 401/404/500 are), so the created
 *    campaign's id is resolved afterwards via GET /campaigns?custom_search=<name>.
 *  - countries/categories are "collections": { type: "targeted"|"blocked", elements: [...] }.
 *    Country elements are plain ISO codes ({ country: "US" }), not dictionary ids.
 *  - pricing is a nested { model, price } object on create/update, but comes back as flat
 *    `price`/`pricing_model` fields on the read model (GET /campaigns, GET /campaigns/{id}).
 *  - PUT /campaigns/play|pause|delete all take the same { campaign_ids: number[] } body.
 *  - advertiser_ad_type/media_storage_template options come from GET /collections/advertiser-ad-types.
 *  - delete is a real delete (the campaign is gone), unlike TrafficStars which only has pause.
 */

export type TrafficFactoryAdvertiserAdType = {
  id: number;
  name: string;
  mediaStorageTemplates: string[];
  sizes: string[];
};

export async function getTrafficFactoryAdvertiserAdTypes(
  sessionToken: string,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryAdvertiserAdType[]> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/collections/advertiser-ad-types`, {
    headers: authHeaders(sessionToken),
  });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError("/collections/advertiser-ad-types", res.status, text);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /collections/advertiser-ad-types Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const rows = unwrapList(data);
  return rows
    .map((row) => {
      const id = pickFirstNumber(row, ["id"]);
      const name = pickFirstString(row, ["name"]);
      if (id === null || !name) return null;
      const templates = Array.isArray(row.media_storage_templates)
        ? (row.media_storage_templates as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      const sizes = Array.isArray(row.size) ? (row.size as unknown[]).filter((s): s is string => typeof s === "string") : [];
      return { id, name, mediaStorageTemplates: templates, sizes };
    })
    .filter((x): x is TrafficFactoryAdvertiserAdType => x !== null);
}

export type TrafficFactoryCategory = {
  id: number;
  name: string;
  longName: string;
};

export async function getTrafficFactoryCategories(
  sessionToken: string,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryCategory[]> {
  const { items } = await fetchPaginatedRecords(sessionToken, "/collections/categories", {}, fetchFn);
  const categories: TrafficFactoryCategory[] = [];
  for (const row of items) {
    if (Number(row.selectable) !== 1) continue;
    const id = pickFirstNumber(row, ["id"]);
    const name = pickFirstString(row, ["name"]);
    if (id === null || !name) continue;
    categories.push({ id, name, longName: pickFirstString(row, ["long_name"]) ?? name });
  }
  return categories;
}

export type TrafficFactoryCampaignDetail = {
  id: number;
  name: string;
  /** Raw numeric status: 1 Running, 0 Paused, -1 Archived. */
  status: number;
  statusLabel: string | null;
  price: number | null;
  pricingModel: number | null;
  maxDailyBudget: number | null;
  totalBudgetLimit: number | null;
  advertiserAdType: number | null;
  mediaStorageTemplate: string | null;
};

function parseCampaignDetail(row: Record<string, unknown>): TrafficFactoryCampaignDetail {
  const calculatedStatus = asRecord(row.calculated_status);
  return {
    id: pickFirstNumber(row, ["id"]) ?? 0,
    name: pickFirstString(row, ["name"]) ?? "",
    status: pickFirstNumber(row, ["status"]) ?? 0,
    statusLabel: calculatedStatus ? pickFirstString(calculatedStatus, ["status"]) : null,
    price: pickFirstNumber(row, ["price"]),
    pricingModel: pickFirstNumber(row, ["pricing_model"]),
    maxDailyBudget: pickFirstNumber(row, ["max_daily_budget"]),
    totalBudgetLimit: pickFirstNumber(row, ["total_budget_limit"]),
    advertiserAdType: pickFirstNumber(row, ["advertiser_ad_type"]),
    mediaStorageTemplate: pickFirstString(row, ["media_storage_template"]),
  };
}

export async function getTrafficFactoryCampaign(
  sessionToken: string,
  campaignId: number,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryCampaignDetail> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}`, {
    headers: authHeaders(sessionToken),
  });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError(`/campaigns/${campaignId}`, res.status, text);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /campaigns/${campaignId} Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const row = asRecord(data);
  if (!row) throw new Error(`Respons /campaigns/${campaignId} Traffic Factory tidak terduga: ${text.slice(0, 300)}`);
  return parseCampaignDetail(row);
}

async function findTrafficFactoryCampaignByName(
  sessionToken: string,
  name: string,
  fetchFn: TfFetch
): Promise<number | null> {
  const url = new URL(`${TRAFFIC_FACTORY_BASE_URL}/campaigns`);
  url.searchParams.set("custom_search", name);
  url.searchParams.set("limit", "50");
  url.searchParams.set("offset", "0");
  const res = await fetchFn(url, { headers: authHeaders(sessionToken) });
  const text = await res.text();
  if (!res.ok) throwTrafficFactoryHttpError("/campaigns", res.status, text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /campaigns Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const rows = unwrapList(data);
  const exact = rows.filter((r) => (pickFirstString(r, ["name"]) ?? "").trim().toLowerCase() === name.trim().toLowerCase());
  const pool = exact.length > 0 ? exact : rows;
  let best: number | null = null;
  for (const r of pool) {
    const id = pickFirstNumber(r, ["id"]);
    if (id !== null && (best === null || id > best)) best = id;
  }
  return best;
}

export type CreateTrafficFactoryCampaignInput = {
  name: string;
  advertiserAdType: number;
  mediaStorageTemplate: string;
  categoryIds: number[];
  countries: string[];
  pricingModel: number;
  price: number;
  maxDailyBudget?: number;
  totalBudgetLimit?: number;
};

function buildCampaignTargetingBody(input: {
  categoryIds: number[];
  countries: string[];
  pricingModel: number;
  price: number;
  maxDailyBudget?: number;
  totalBudgetLimit?: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    categories: { type: "targeted", elements: input.categoryIds },
    countries: { type: "targeted", elements: input.countries.map((c) => ({ country: c })) },
    pricing: { model: input.pricingModel, price: input.price },
  };
  if (input.maxDailyBudget) {
    body.max_daily_budget = input.maxDailyBudget;
    body.daily_limit_type = 1; // 0 None, 1 Budget, 2 Impressions
  }
  if (input.totalBudgetLimit) body.total_budget_limit = input.totalBudgetLimit;
  return body;
}

/** Creates the campaign, then resolves its id via a name lookup since POST /campaigns' 200 body isn't documented. */
export async function createTrafficFactoryCampaign(
  sessionToken: string,
  input: CreateTrafficFactoryCampaignInput,
  fetchFn: TfFetch = fetch
): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    name: input.name,
    advertiser_ad_type: input.advertiserAdType,
    media_storage_template: input.mediaStorageTemplate,
    ...buildCampaignTargetingBody(input),
  };

  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns`, {
    method: "POST",
    headers: { ...authHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError("/campaigns", res.status, text);
  }

  const id = await findTrafficFactoryCampaignByName(sessionToken, input.name, fetchFn);
  if (id === null) {
    throw new Error(
      `Campaign berhasil dibuat di Traffic Factory tapi gagal nemuin ID-nya lagi (cari nama "${input.name}"). Cek langsung di dashboard Traffic Factory.`
    );
  }
  return { id };
}

export type UpdateTrafficFactoryCampaignInput = {
  name?: string;
  categoryIds?: number[];
  countries?: string[];
  pricingModel?: number;
  price?: number;
  maxDailyBudget?: number;
  totalBudgetLimit?: number;
};

export async function updateTrafficFactoryCampaign(
  sessionToken: string,
  campaignId: number,
  input: UpdateTrafficFactoryCampaignInput,
  fetchFn: TfFetch = fetch
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.categoryIds !== undefined) body.categories = { type: "targeted", elements: input.categoryIds };
  if (input.countries !== undefined) body.countries = { type: "targeted", elements: input.countries.map((c) => ({ country: c })) };
  if (input.pricingModel !== undefined && input.price !== undefined) {
    body.pricing = { model: input.pricingModel, price: input.price };
  }
  if (input.maxDailyBudget !== undefined) {
    body.max_daily_budget = input.maxDailyBudget;
    body.daily_limit_type = input.maxDailyBudget > 0 ? 1 : 0;
  }
  if (input.totalBudgetLimit !== undefined) body.total_budget_limit = input.totalBudgetLimit;

  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}`, {
    method: "PUT",
    headers: { ...authHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throwTrafficFactoryHttpError(`/campaigns/${campaignId}`, res.status, text);
  }
}

async function bulkCampaignAction(
  sessionToken: string,
  path: "/campaigns/play" | "/campaigns/pause" | "/campaigns/delete",
  campaignIds: number[],
  fetchFn: TfFetch
): Promise<void> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}${path}`, {
    method: "PUT",
    headers: { ...authHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ campaign_ids: campaignIds }),
  });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError(path, res.status, text);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return; // best-effort error array check below; a non-JSON 2xx body is still a success
  }
  const record = asRecord(data);
  const errors = record && Array.isArray(record.errors) ? (record.errors as unknown[]) : [];
  if (errors.length > 0) {
    throw new Error(`Traffic Factory menolak sebagian aksi: ${errors.map(String).join("; ").slice(0, 300)}`);
  }
}

export async function setTrafficFactoryCampaignsRunState(
  sessionToken: string,
  campaignIds: number[],
  action: "play" | "pause",
  fetchFn: TfFetch = fetch
): Promise<void> {
  await bulkCampaignAction(sessionToken, action === "play" ? "/campaigns/play" : "/campaigns/pause", campaignIds, fetchFn);
}

export async function deleteTrafficFactoryCampaigns(
  sessionToken: string,
  campaignIds: number[],
  fetchFn: TfFetch = fetch
): Promise<void> {
  await bulkCampaignAction(sessionToken, "/campaigns/delete", campaignIds, fetchFn);
}
