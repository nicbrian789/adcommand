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

/**
 * Like pickFirstNumber, but also unwraps a `{id, name}`-style enum object and returns its `id` —
 * confirmed from a live response that pricing_model comes back this way on GET /campaigns/{id}
 * (e.g. {"id":0,"name":"Standard"}), not as the bare integer the schema documents.
 */
function pickFirstNumberOrObjectId(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const obj = asRecord(v);
    if (obj) {
      const id = pickFirstNumber(obj, ["id"]);
      if (id !== null) return id;
    }
  }
  return null;
}

/**
 * Generic version of the { result: {...} } / { result: [{...}] } unwrap confirmed on
 * GET /campaigns/{id}. Applied here to the POST /library/file and /library/url responses too —
 * both were written to expect the created object directly at the top level, before that wrapper
 * pattern was confirmed to exist on this API, so they're likely wrong in the same way.
 */
function unwrapSingleResultObject(
  data: unknown,
  looksRight: (r: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  // Confirmed live: POST /library/url returns a bare array ([{...}]) at the very top level, no
  // wrapper object at all — different again from /campaigns/{id}'s { result: {...} } wrapper.
  if (Array.isArray(data) && data.length > 0) {
    const first = asRecord(data[0]);
    if (first && looksRight(first)) return first;
  }
  const root = asRecord(data);
  if (!root) return null;
  if (looksRight(root)) return root;
  for (const key of ["result", "data"]) {
    const value = root[key];
    const nested = asRecord(value);
    if (nested && looksRight(nested)) return nested;
    if (Array.isArray(value) && value.length > 0) {
      const first = asRecord(value[0]);
      if (first && looksRight(first)) return first;
    }
  }
  return null;
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

export type TrafficFactoryAspectRatio = {
  tag: string;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
};

export type TrafficFactoryAdvertiserAdType = {
  id: number;
  name: string;
  mediaStorageTemplates: string[];
  sizes: string[];
  aspectRatios: TrafficFactoryAspectRatio[];
};

function parseAspectRatios(value: unknown): TrafficFactoryAspectRatio[] {
  if (!Array.isArray(value)) return [];
  const out: TrafficFactoryAspectRatio[] = [];
  for (const raw of value) {
    const row = asRecord(raw);
    if (!row) continue;
    const minWidth = pickFirstNumber(row, ["min_width"]);
    const maxWidth = pickFirstNumber(row, ["max_width"]);
    const minHeight = pickFirstNumber(row, ["min_height"]);
    const maxHeight = pickFirstNumber(row, ["max_height"]);
    if (minWidth === null || maxWidth === null || minHeight === null || maxHeight === null) continue;
    out.push({
      tag: pickFirstString(row, ["tag"]) ?? pickFirstString(row, ["aspect_ratio"]) ?? "",
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
    });
  }
  return out;
}

async function fetchAdvertiserAdTypesRaw(
  sessionToken: string,
  fetchFn: TfFetch,
  showDetails: boolean
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${TRAFFIC_FACTORY_BASE_URL}/collections/advertiser-ad-types`);
  if (showDetails) url.searchParams.set("show_details", "true");
  const res = await fetchFn(url, { headers: authHeaders(sessionToken) });
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
  return unwrapList(data);
}

export async function getTrafficFactoryAdvertiserAdTypes(
  sessionToken: string,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryAdvertiserAdType[]> {
  // Two separate calls on purpose: the plain call (no show_details) is the one already proven
  // in production to return media_storage_templates/size as flat string arrays. show_details=true
  // was added later purely to read aspect_ratios (confirmed needed from a live 400: "Asset does
  // not meet the required dimensions or aspect ratio"), but it turned out to also change the
  // shape of media_storage_templates on a live account, silently breaking every ad type's
  // templates when both concerns shared one call. Keeping them separate means the proven call
  // can never regress regardless of what show_details does to other fields.
  const [basicRows, detailedRows] = await Promise.all([
    fetchAdvertiserAdTypesRaw(sessionToken, fetchFn, false),
    fetchAdvertiserAdTypesRaw(sessionToken, fetchFn, true),
  ]);

  const aspectRatiosById = new Map<number, TrafficFactoryAspectRatio[]>();
  for (const row of detailedRows) {
    const id = pickFirstNumber(row, ["id"]);
    if (id === null) continue;
    aspectRatiosById.set(id, parseAspectRatios(row.aspect_ratios));
  }

  return basicRows
    .map((row) => {
      const id = pickFirstNumber(row, ["id"]);
      const name = pickFirstString(row, ["name"]);
      if (id === null || !name) return null;
      const templates = Array.isArray(row.media_storage_templates)
        ? (row.media_storage_templates as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      const sizes = Array.isArray(row.size) ? (row.size as unknown[]).filter((s): s is string => typeof s === "string") : [];
      return { id, name, mediaStorageTemplates: templates, sizes, aspectRatios: aspectRatiosById.get(id) ?? [] };
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

export type TrafficFactoryCountry = {
  id: number;
  iso2: string;
  iso3: string;
  name: string;
};

export async function getTrafficFactoryCountries(
  sessionToken: string,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryCountry[]> {
  const { items } = await fetchPaginatedRecords(sessionToken, "/collections/countries", {}, fetchFn);
  const countries: TrafficFactoryCountry[] = [];
  for (const row of items) {
    const iso2 = pickFirstString(row, ["iso2"]);
    const iso3 = pickFirstString(row, ["iso3"]);
    if (!iso2 || !iso3) continue;
    const name = pickFirstString(row, ["short_name", "long_name"]) ?? iso3;
    countries.push({ id: pickFirstNumber(row, ["id"]) ?? 0, iso2: iso2.toUpperCase(), iso3: iso3.toUpperCase(), name });
  }
  return countries;
}

/**
 * Campaign country targeting needs ISO3 codes ("IDN", "USA"), confirmed from a real 400 response
 * ("Campaign countries ID is invalid. Valid values: 'XXX', 'AFG', 'ALB', ..." — all ISO3), while
 * the rest of this app works in ISO2 ("ID", "US"). Resolves either against Traffic Factory's own
 * /collections/countries so the mapping can never drift from what the API actually accepts.
 */
function resolveCountryIso3Codes(requested: string[], countries: TrafficFactoryCountry[]): string[] {
  const byIso2 = new Map(countries.map((c) => [c.iso2, c.iso3]));
  const validIso3 = new Set(countries.map((c) => c.iso3));
  const resolved: string[] = [];
  const invalid: string[] = [];
  for (const raw of requested) {
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    if (validIso3.has(code)) {
      resolved.push(code);
      continue;
    }
    const mapped = byIso2.get(code);
    if (mapped) {
      resolved.push(mapped);
      continue;
    }
    invalid.push(raw);
  }
  if (invalid.length > 0) {
    throw new Error(`Kode negara nggak dikenali di Traffic Factory: ${invalid.join(", ")}. Pakai kode ISO 2 huruf (ID, US) atau 3 huruf (IDN, USA).`);
  }
  return resolved;
}

/** Simple {id, name} dictionaries — devices, browsers, operating systems, languages all share this shape. */
export type TrafficFactoryDictItem = { id: number; name: string };

async function getTrafficFactoryDict(path: string, sessionToken: string, fetchFn: TfFetch): Promise<TrafficFactoryDictItem[]> {
  const { items } = await fetchPaginatedRecords(sessionToken, path, {}, fetchFn);
  const out: TrafficFactoryDictItem[] = [];
  for (const row of items) {
    const id = pickFirstNumber(row, ["id"]);
    const name = pickFirstString(row, ["name"]);
    if (id === null || !name) continue;
    out.push({ id, name });
  }
  return out;
}

export function getTrafficFactoryDevices(sessionToken: string, fetchFn: TfFetch = fetch) {
  return getTrafficFactoryDict("/collections/devices", sessionToken, fetchFn);
}

export function getTrafficFactoryBrowsers(sessionToken: string, fetchFn: TfFetch = fetch) {
  return getTrafficFactoryDict("/collections/browsers", sessionToken, fetchFn);
}

export function getTrafficFactoryOperatingSystems(sessionToken: string, fetchFn: TfFetch = fetch) {
  return getTrafficFactoryDict("/collections/operating-systems", sessionToken, fetchFn);
}

export function getTrafficFactoryLanguages(sessionToken: string, fetchFn: TfFetch = fetch) {
  return getTrafficFactoryDict("/collections/languages", sessionToken, fetchFn);
}

/** /collections/carriers has no country filter param — it's a flat global list, confirmed from the live swagger.json
 * (not per-country dependent, despite how the docs sidebar groups it next to countries). */
export function getTrafficFactoryCarriers(sessionToken: string, fetchFn: TfFetch = fetch) {
  return getTrafficFactoryDict("/collections/carriers", sessionToken, fetchFn);
}

export async function getTrafficFactoryTimezones(sessionToken: string, fetchFn: TfFetch = fetch): Promise<string[]> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/collections/timezones`, { headers: authHeaders(sessionToken) });
  const text = await res.text();
  if (!res.ok) throwTrafficFactoryHttpError("/collections/timezones", res.status, text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /collections/timezones Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const rows = unwrapList(data);
  const names = rows.map((r) => pickFirstString(r, ["name"])).filter((n): n is string => !!n);
  return [...new Set(names)].sort();
}

export type TrafficFactoryMultiStringList = { targeted: string[]; blocked: string[] };

function parseMultiStringCollection(value: unknown): TrafficFactoryMultiStringList {
  const row = asRecord(value);
  const toStrings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { targeted: toStrings(row?.targeted), blocked: toStrings(row?.blocked) };
}

function parseIntCollectionIds(value: unknown): number[] {
  const row = asRecord(value);
  const elements = row?.elements;
  return Array.isArray(elements) ? elements.filter((x): x is number => typeof x === "number") : [];
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
  size: string | null;
  startDate: string | null;
  endDate: string | null;
  totalImpressions: number | null;
  maxDailyImpressions: number | null;
  /** Read-model capping shape ({quantity,frequency,level}) differs from the write-model
   * frequency_capping ({enabled,impressions,minutes,level}) — mapped here for display. */
  frequencyCappingImpressions: number | null;
  frequencyCappingMinutes: number | null;
  /** ISO2 (not ISO3) — converted back for display consistency with the rest of this app. */
  countries: string[];
  categoryIds: number[];
  deviceIds: number[];
  browserIds: number[];
  osIds: number[];
  languageIds: number[];
  carrierIds: number[];
  sites: TrafficFactoryMultiStringList;
  keywords: TrafficFactoryMultiStringList;
  ipRanges: TrafficFactoryMultiStringList;
  dayPartingTimezone: string | null;
  dayParting: TrafficFactoryDayPartEntry[];
};

/**
 * Confirmed from a live 400 response: "Campaign max daily budget should be greater than or equal
 * to 2000. Please specify amount in cents." — money fields on campaign create/update/read
 * (price, max_daily_budget, total_budget_limit) are integer cents, not dollar floats, unlike the
 * /statistics/* endpoints (already verified in production to be plain dollars). total_budget_limit
 * is inferred to share this (same integer type, same sibling field in the same schema) rather than
 * separately confirmed.
 */
function centsToDollars(cents: number | null): number | null {
  return cents === null ? null : Math.round(cents) / 100;
}

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Two payloads on purpose, same reasoning as getTrafficFactoryAdvertiserAdTypes: `basicRow` is the
 * plain GET /campaigns/{id} (no detailed param) — the shape already proven correct (it's the same
 * flat Campaign object the sync/list code has always parsed successfully) — and is the only source
 * for name/status/price/budget/etc. `detailedPayload` (GET ...?detailed=true) is used only for the
 * sibling targeting collections (countries/categories/devices/...), since those aren't present
 * without it. A live account showed the detailed call changing flat-field shape in a way that left
 * name/price/etc empty when both concerns shared one call — keeping them separate means that can
 * never again blank out the basic fields.
 */
const DETAIL_SIBLING_KEYS = [
  "countries",
  "categories",
  "devices",
  "browsers",
  "operating_systems",
  "languages",
  "carriers",
  "sites",
  "keywords",
  "ip_ranges",
  "day_parting",
];

/**
 * Same result-wrapper pattern confirmed for the plain call (GET /campaigns/{id} -> { result:
 * { campaign: {...} } }) likely applies here too — tries the top level first, then unwraps
 * `.result` if that's where the sibling targeting collections actually live instead.
 */
function unwrapDetailedPayload(detailedPayload: Record<string, unknown>): Record<string, unknown> {
  if (DETAIL_SIBLING_KEYS.some((k) => k in detailedPayload)) return detailedPayload;
  const result = asRecord(detailedPayload.result);
  if (result && DETAIL_SIBLING_KEYS.some((k) => k in result)) return result;
  return detailedPayload;
}

function parseCampaignDetail(
  basicRow: Record<string, unknown>,
  detailedPayload: Record<string, unknown>,
  countries: TrafficFactoryCountry[]
): TrafficFactoryCampaignDetail {
  const campaign = basicRow;
  const payload = unwrapDetailedPayload(detailedPayload);
  const calculatedStatus = asRecord(campaign.calculated_status);
  const capping = asRecord(campaign.capping);

  const iso3ToIso2 = new Map(countries.map((c) => [c.iso3, c.iso2]));
  const countryEls = asRecord(payload.countries)?.elements;
  const countryCodes = Array.isArray(countryEls)
    ? countryEls
        .map((e) => pickFirstString(asRecord(e) ?? {}, ["country"]))
        .filter((c): c is string => !!c)
        .map((iso3) => iso3ToIso2.get(iso3.toUpperCase()) ?? iso3)
    : [];

  return {
    id: pickFirstNumber(campaign, ["id"]) ?? 0,
    name: pickFirstString(campaign, ["name"]) ?? "",
    status: pickFirstNumberOrObjectId(campaign, ["status"]) ?? 0,
    statusLabel: calculatedStatus ? pickFirstString(calculatedStatus, ["status"]) : null,
    price: centsToDollars(pickFirstNumber(campaign, ["price"])),
    pricingModel: pickFirstNumberOrObjectId(campaign, ["pricing_model"]),
    maxDailyBudget: centsToDollars(pickFirstNumber(campaign, ["max_daily_budget"])),
    totalBudgetLimit: centsToDollars(pickFirstNumber(campaign, ["total_budget_limit"])),
    advertiserAdType: pickFirstNumber(campaign, ["advertiser_ad_type"]),
    mediaStorageTemplate: pickFirstString(campaign, ["media_storage_template"]),
    size: pickFirstString(campaign, ["size"]),
    startDate: pickFirstString(campaign, ["start_date"]),
    endDate: pickFirstString(campaign, ["end_date"]),
    totalImpressions: pickFirstNumber(campaign, ["total_impressions"]),
    maxDailyImpressions: pickFirstNumber(campaign, ["max_daily_impressions"]),
    frequencyCappingImpressions: capping ? pickFirstNumber(capping, ["quantity"]) : null,
    frequencyCappingMinutes: capping ? pickFirstNumber(capping, ["frequency"]) : null,
    countries: countryCodes,
    categoryIds: parseIntCollectionIds(payload.categories),
    deviceIds: parseIntCollectionIds(payload.devices),
    browserIds: parseIntCollectionIds(payload.browsers),
    osIds: parseIntCollectionIds(payload.operating_systems),
    languageIds: parseIntCollectionIds(payload.languages),
    carrierIds: parseIntCollectionIds(payload.carriers),
    sites: parseMultiStringCollection(payload.sites),
    keywords: parseMultiStringCollection(payload.keywords),
    ipRanges: parseMultiStringCollection(payload.ip_ranges),
    dayPartingTimezone: pickFirstString(asRecord(payload.day_parting) ?? {}, ["timezone"]),
    dayParting: (() => {
      const parting = asRecord(payload.day_parting)?.parting;
      if (!Array.isArray(parting)) return [];
      return parting
        .map((p) => {
          const row = asRecord(p);
          const day = row ? pickFirstNumber(row, ["day"]) : null;
          const hours = Array.isArray(row?.hours) ? row.hours.filter((h): h is number => typeof h === "number") : [];
          return day !== null ? { day, hours } : null;
        })
        .filter((x): x is TrafficFactoryDayPartEntry => x !== null);
    })(),
  };
}

/**
 * Tries the raw object first, then common single-resource wrapper keys ("result"/"data"/
 * "campaign") — never verified directly which (if any) GET /campaigns/{id} actually uses, so this
 * picks whichever candidate actually looks like a campaign (has both id and name) rather than
 * assuming one shape.
 */
/**
 * Confirmed from a live response: GET /campaigns/{id} (no detailed param) actually returns
 * { result: { campaign: {...flat fields...} } } — the "campaign" sub-object the CampaignDetail
 * schema documents for ?detailed=true, except it's ALSO used here, nested one level deeper under
 * "result" too. Checked in order: the two confirmed real shapes first, then the originally-assumed
 * ones (object directly under a wrapper key, or a one-item array) as a safety net in case the
 * shape differs again on another account or a future API change.
 */
function unwrapSingleCampaignObject(data: unknown): Record<string, unknown> | null {
  const looksLikeCampaign = (r: Record<string, unknown>) => "id" in r && "name" in r;
  // Confirmed elsewhere on this same API (POST /library/url): a bare array at the very top level,
  // no wrapper object, is a real shape this API uses — checked here too as a safety net.
  if (Array.isArray(data) && data.length > 0) {
    const first = asRecord(data[0]);
    if (first && looksLikeCampaign(first)) return first;
  }
  const root = asRecord(data);
  if (!root) return null;
  if (looksLikeCampaign(root)) return root;
  for (const key of ["result", "data", "campaign"]) {
    const value = root[key];
    const nested = asRecord(value);
    if (nested) {
      if (looksLikeCampaign(nested)) return nested;
      const innerCampaign = asRecord(nested.campaign);
      if (innerCampaign && looksLikeCampaign(innerCampaign)) return innerCampaign;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = asRecord(value[0]);
      if (first && looksLikeCampaign(first)) return first;
    }
  }
  return root;
}

async function fetchCampaignRaw(
  sessionToken: string,
  campaignId: number,
  fetchFn: TfFetch,
  detailed: boolean
): Promise<Record<string, unknown>> {
  const url = new URL(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}`);
  if (detailed) url.searchParams.set("detailed", "true");
  const res = await fetchFn(url, { headers: authHeaders(sessionToken) });
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
  const row = unwrapSingleCampaignObject(data);
  if (!row) throw new Error(`Respons /campaigns/${campaignId} Traffic Factory tidak terduga: ${text.slice(0, 300)}`);
  return row;
}

export async function getTrafficFactoryCampaign(
  sessionToken: string,
  campaignId: number,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryCampaignDetail> {
  const [basicRow, detailedPayload, countries] = await Promise.all([
    fetchCampaignRaw(sessionToken, campaignId, fetchFn, false),
    fetchCampaignRaw(sessionToken, campaignId, fetchFn, true),
    getTrafficFactoryCountries(sessionToken, fetchFn),
  ]);
  // If id/name still can't be found after unwrapping, don't silently render a blank form again —
  // surface the raw response (not just key names, which weren't enough to diagnose this once
  // already) so the next failure gives a definitive answer instead of another guess.
  if (!("id" in basicRow) || !("name" in basicRow)) {
    throw new Error(
      `Nggak nemu field id/name di respons GET /campaigns/${campaignId} Traffic Factory. Isi respons: ${JSON.stringify(basicRow).slice(0, 2000)}`
    );
  }
  const detail = parseCampaignDetail(basicRow, detailedPayload, countries);
  // Countries are required when a campaign is created through this app (validated before the
  // create call ever goes out), so a campaign coming back with none on Edit almost certainly means
  // the sibling-collection unwrap guessed wrong again rather than the campaign genuinely having no
  // targeting. Logged (not thrown) so the page still renders what Edit got right.
  if (detail.countries.length === 0) {
    console.error(
      `getTrafficFactoryCampaign: campaign ${campaignId} came back with 0 countries targeted — sibling-collection unwrap may be wrong. Raw detailed payload: ${JSON.stringify(detailedPayload).slice(0, 2000)}`
    );
  }
  return detail;
}

async function findTrafficFactoryCampaignByName(
  sessionToken: string,
  name: string,
  fetchFn: TfFetch
): Promise<{ id: number | null; rawText: string }> {
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
  return { id: best, rawText: text };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared by create and update — every field here is optional so update can send a partial PUT. */
/** { day: 1-7, hours: 0-23[] }. Day numbering (1=Monday..7=Sunday, ISO 8601) is NOT documented in
 * the spec — this is the most common convention in REST ad-tech APIs but is unverified against a
 * live account. Flag to the user the first time this is used in case it turns out reversed. */
export type TrafficFactoryDayPartEntry = { day: number; hours: number[] };

type ExtendedTargetingInput = {
  deviceIds?: number[];
  browserIds?: number[];
  osIds?: number[];
  languageIds?: number[];
  carrierIds?: number[];
  startDate?: string | null;
  endDate?: string | null;
  totalImpressions?: number;
  maxDailyImpressions?: number;
  frequencyCapping?: { enabled: boolean; impressions?: number; minutes?: number };
  sites?: TrafficFactoryMultiStringList;
  keywords?: TrafficFactoryMultiStringList;
  ipRanges?: TrafficFactoryMultiStringList;
  dayParting?: { timezone: string; parting: TrafficFactoryDayPartEntry[] };
};

function applyExtendedTargetingBody(body: Record<string, unknown>, input: ExtendedTargetingInput): void {
  if (input.deviceIds !== undefined) body.devices = { type: "targeted", elements: input.deviceIds };
  if (input.browserIds !== undefined) body.browsers = { type: "targeted", elements: input.browserIds };
  if (input.osIds !== undefined) body.operating_systems = { type: "targeted", elements: input.osIds };
  if (input.languageIds !== undefined) body.languages = { type: "targeted", elements: input.languageIds };
  if (input.carrierIds !== undefined) body.carriers = { type: "targeted", elements: input.carrierIds };
  if (input.dayParting !== undefined) body.day_parting = input.dayParting;
  if (input.startDate !== undefined) body.start_date = input.startDate;
  if (input.endDate !== undefined) body.end_date = input.endDate;
  if (input.totalImpressions !== undefined) body.total_impressions = input.totalImpressions;
  if (input.maxDailyImpressions !== undefined) {
    body.max_daily_impressions = input.maxDailyImpressions;
    if (input.maxDailyImpressions > 0 && body.daily_limit_type === undefined) body.daily_limit_type = 2;
  }
  if (input.frequencyCapping !== undefined) {
    body.frequency_capping = {
      enabled: input.frequencyCapping.enabled,
      impressions: input.frequencyCapping.impressions,
      minutes: input.frequencyCapping.minutes,
    };
  }
  if (input.sites !== undefined) body.sites = input.sites;
  if (input.keywords !== undefined) body.keywords = input.keywords;
  if (input.ipRanges !== undefined) body.ip_ranges = input.ipRanges;
}

export type CreateTrafficFactoryCampaignInput = ExtendedTargetingInput & {
  name: string;
  advertiserAdType: number;
  mediaStorageTemplate: string;
  /** Required when the chosen ad type supports more than one size (e.g. banner formats). */
  size?: string;
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
    pricing: { model: input.pricingModel, price: dollarsToCents(input.price) },
  };
  if (input.maxDailyBudget) {
    body.max_daily_budget = dollarsToCents(input.maxDailyBudget);
    body.daily_limit_type = 1; // 0 None, 1 Budget, 2 Impressions
  }
  if (input.totalBudgetLimit) body.total_budget_limit = dollarsToCents(input.totalBudgetLimit);
  return body;
}

/** Creates the campaign, then resolves its id via a name lookup since POST /campaigns' 200 body isn't documented. */
export async function createTrafficFactoryCampaign(
  sessionToken: string,
  input: CreateTrafficFactoryCampaignInput,
  fetchFn: TfFetch = fetch
): Promise<{ id: number }> {
  const countries = await getTrafficFactoryCountries(sessionToken, fetchFn);
  const body: Record<string, unknown> = {
    name: input.name,
    advertiser_ad_type: input.advertiserAdType,
    media_storage_template: input.mediaStorageTemplate,
    ...(input.size ? { size: input.size } : {}),
    ...buildCampaignTargetingBody({ ...input, countries: resolveCountryIso3Codes(input.countries, countries) }),
  };
  applyExtendedTargetingBody(body, input);

  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns`, {
    method: "POST",
    headers: { ...authHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError("/campaigns", res.status, text);
  }

  // The 200 body isn't documented in the spec, but try it anyway in case it does carry an id —
  // avoids the name-search round trip (and its failure modes) entirely when it's there.
  try {
    const data = JSON.parse(text);
    const row = asRecord(data) ?? asRecord(asRecord(data)?.result);
    const directId = row ? pickFirstNumber(row, ["id"]) : null;
    if (directId !== null) return { id: directId };
  } catch {
    // not JSON, or no usable id — fall through to the name search
  }

  let lookup = await findTrafficFactoryCampaignByName(sessionToken, input.name, fetchFn);
  if (lookup.id === null) {
    // Give the API a moment in case the new campaign isn't immediately searchable, then try once more.
    await sleep(1500);
    lookup = await findTrafficFactoryCampaignByName(sessionToken, input.name, fetchFn);
  }
  if (lookup.id === null) {
    throw new Error(
      `Campaign berhasil dibuat di Traffic Factory (respons POST: ${text.slice(0, 300)}) tapi gagal nemuin ID-nya lagi lewat pencarian nama "${input.name}" (respons pencarian: ${lookup.rawText.slice(0, 300)}). Cek langsung di dashboard Traffic Factory.`
    );
  }
  const id = lookup.id;
  return { id };
}

export type UpdateTrafficFactoryCampaignInput = ExtendedTargetingInput & {
  name?: string;
  /** 1 Running, 0 Paused, -1 Archived — prefer setTrafficFactoryCampaignsRunState for play/pause. */
  status?: number;
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
  if (input.status !== undefined) body.status = input.status;
  if (input.categoryIds !== undefined) body.categories = { type: "targeted", elements: input.categoryIds };
  if (input.countries !== undefined) {
    const countries = await getTrafficFactoryCountries(sessionToken, fetchFn);
    const iso3 = resolveCountryIso3Codes(input.countries, countries);
    body.countries = { type: "targeted", elements: iso3.map((c) => ({ country: c })) };
  }
  if (input.pricingModel !== undefined && input.price !== undefined) {
    body.pricing = { model: input.pricingModel, price: dollarsToCents(input.price) };
  }
  if (input.maxDailyBudget !== undefined) {
    body.max_daily_budget = dollarsToCents(input.maxDailyBudget);
    body.daily_limit_type = input.maxDailyBudget > 0 ? 1 : 0;
  }
  if (input.totalBudgetLimit !== undefined) body.total_budget_limit = dollarsToCents(input.totalBudgetLimit);
  applyExtendedTargetingBody(body, input);

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

/**
 * Creative upload. Confirmed from the live swagger.json: Traffic Factory separates "Library"
 * (an uploaded-asset pool, shared across campaigns) from "Variation" (the creative actually
 * attached to one campaign, referencing a Library file by id) — unlike TrafficStars' banners,
 * which accept a direct file upload in one call. The flow here is necessarily two calls:
 * upload to POST /library/file to get an id, then POST /campaigns/{id}/variation with that id.
 * Only image uploads are wired up (video needs a separate video_thumb Library entry too).
 */
export type TrafficFactoryLibraryFile = {
  id: number;
  type: string;
  url: string;
};

export async function uploadTrafficFactoryLibraryFile(
  sessionToken: string,
  file: File,
  opts: { advertiserAdTypeId?: number } = {},
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryLibraryFile> {
  const url = new URL(`${TRAFFIC_FACTORY_BASE_URL}/library/file`);
  url.searchParams.set("type", "image");
  if (opts.advertiserAdTypeId !== undefined) url.searchParams.set("advertiser_ad_type_id", String(opts.advertiserAdTypeId));

  const form = new FormData();
  form.append("file", file, file.name);

  const res = await fetchFn(url, { method: "POST", headers: authHeaders(sessionToken), body: form });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError("/library/file", res.status, text);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /library/file Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const row = unwrapSingleResultObject(data, (r) => "id" in r);
  const id = row ? pickFirstNumber(row, ["id"]) : null;
  if (!row || id === null) {
    throw new Error(`Respons /library/file Traffic Factory tidak terduga: ${text.slice(0, 500)}`);
  }
  return { id, type: pickFirstString(row, ["type"]) ?? "image", url: pickFirstString(row, ["url"]) ?? "" };
}

/**
 * Landing URLs go through the Library too, same as images — confirmed from a live 400
 * ("Parameter durl not allowed in img_banner"): the raw `durl` string field on
 * POST /campaigns/{id}/variation is rejected for at least the img_banner media storage
 * template, and /library/url exists as a direct JSON-body counterpart to /library/file
 * (POST {url} -> {id, url, status}) for exactly this purpose.
 */
export async function uploadTrafficFactoryLibraryUrl(
  sessionToken: string,
  url: string,
  fetchFn: TfFetch = fetch
): Promise<{ id: number; url: string }> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/library/url`, {
    method: "POST",
    headers: { ...authHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const text = await res.text();
  if (!res.ok) {
    throwTrafficFactoryHttpError("/library/url", res.status, text);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /library/url Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const row = unwrapSingleResultObject(data, (r) => "id" in r);
  const id = row ? pickFirstNumber(row, ["id"]) : null;
  if (!row || id === null) {
    throw new Error(`Respons /library/url Traffic Factory tidak terduga: ${text.slice(0, 500)}`);
  }
  return { id, url: pickFirstString(row, ["url"]) ?? url };
}

export type TrafficFactoryVariation = {
  id: number;
  name: string | null;
  active: boolean;
  imageUrl: string | null;
  landingUrl: string | null;
  statusLabel: string | null;
};

function parseVariation(row: Record<string, unknown>): TrafficFactoryVariation {
  const calculatedStatus = asRecord(row.calculated_status);
  return {
    id: pickFirstNumber(row, ["idvariation", "id"]) ?? 0,
    name: pickFirstString(row, ["name"]),
    active: Number(row.active) === 1,
    imageUrl: pickFirstString(row, ["imgurl"]),
    // A variation created via id_library_url (not the rejected raw durl) may echo the resolved
    // landing URL back under a different key than "durl" — click_url/url are the other URL-ish
    // fields VariationDetails documents, tried here as fallbacks rather than assumed absent.
    landingUrl: pickFirstString(row, ["durl", "click_url", "url"]),
    statusLabel: calculatedStatus ? pickFirstString(calculatedStatus, ["status"]) : pickFirstString(row, ["status"]),
  };
}

export async function listTrafficFactoryVariations(
  sessionToken: string,
  campaignId: number,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryVariation[]> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}/variation`, {
    headers: authHeaders(sessionToken),
  });
  const text = await res.text();
  if (!res.ok) throwTrafficFactoryHttpError(`/campaigns/${campaignId}/variation`, res.status, text);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons /campaigns/${campaignId}/variation Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }
  const record = asRecord(data);
  const rows = record && Array.isArray(record.variations) ? (record.variations as Record<string, unknown>[]) : unwrapList(data);
  return rows.map(parseVariation);
}

export type CreateTrafficFactoryVariationInput = {
  idLibraryFile: number;
  idLibraryUrl: number;
  name?: string;
  brand?: string;
};

export async function createTrafficFactoryVariation(
  sessionToken: string,
  campaignId: number,
  input: CreateTrafficFactoryVariationInput,
  fetchFn: TfFetch = fetch
): Promise<void> {
  const form = new FormData();
  form.append("id_library_file", String(input.idLibraryFile));
  form.append("id_library_url", String(input.idLibraryUrl));
  if (input.name) form.append("name", input.name);
  if (input.brand) form.append("brand", input.brand);

  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}/variation`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throwTrafficFactoryHttpError(`/campaigns/${campaignId}/variation`, res.status, text);
  }
}

export async function deleteTrafficFactoryVariation(
  sessionToken: string,
  campaignId: number,
  variationId: number,
  fetchFn: TfFetch = fetch
): Promise<void> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}/variation/${variationId}`, {
    method: "DELETE",
    headers: authHeaders(sessionToken),
  });
  if (!res.ok) {
    const text = await res.text();
    throwTrafficFactoryHttpError(`/campaigns/${campaignId}/variation/${variationId}`, res.status, text);
  }
}

export type UpdateTrafficFactoryVariationInput = {
  idLibraryUrl?: number;
  name?: string;
  brand?: string;
};

/** PUT .../variation/{id} — JSON body, unlike the multipart POST that creates one. Confirmed from
 * the live swagger.json that it has no id_library_file field at all, so the image can't be
 * replaced through this endpoint — only the landing URL (via id_library_url) and name/brand. */
export async function updateTrafficFactoryVariation(
  sessionToken: string,
  campaignId: number,
  variationId: number,
  input: UpdateTrafficFactoryVariationInput,
  fetchFn: TfFetch = fetch
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.idLibraryUrl !== undefined) body.id_library_url = input.idLibraryUrl;
  if (input.name !== undefined) body.name = input.name;
  if (input.brand !== undefined) body.brand = input.brand;

  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/campaigns/${campaignId}/variation/${variationId}`, {
    method: "PUT",
    headers: { ...authHeaders(sessionToken), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throwTrafficFactoryHttpError(`/campaigns/${campaignId}/variation/${variationId}`, res.status, text);
  }
}
