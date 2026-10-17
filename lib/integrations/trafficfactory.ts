/**
 * Traffic Factory API v2 — read-only connector.
 *
 * Auth note (uncertain vs public docs — docs are gated):
 * Prior ADCOMMAND code used API token → POST /login → Bearer session.
 * That flow is retained for compatibility; it is NOT claimed as the only
 * official method. Callers must not treat login success as proof of field semantics.
 *
 * Network I/O is injectable via fetchFn (unit tests use mocks; no live calls in CI).
 */

export const TRAFFIC_FACTORY_BASE_URL = "https://api.trafficfactory.com/v2";

/**
 * Spend allowlist only. Responses may also include `value` — do NOT map it to spend
 * without verified semantics (could be revenue, eCPM base, or other).
 */
export const TF_SPEND_KEYS = ["cost", "spend", "spending"] as const;
/** Impressions allowlist only — never map `hits` without verification. */
export const TF_IMPRESSION_KEYS = ["impressions", "impression"] as const;
export const TF_CLICK_KEYS = ["clicks", "click"] as const;
/** Balance only — `funds`/`credit` omitted (semantics unverified). */
export const TF_BALANCE_KEYS = ["balance", "account_balance"] as const;
export const TF_CURRENCY_KEYS = ["currency", "currency_code"] as const;

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

function authHeaders(sessionToken: string): HeadersInit {
  return { Authorization: `Bearer ${sessionToken}`, Accept: "application/json" };
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

/** Unwrap common list envelopes used by TF-style JSON APIs. */
export function unwrapList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  const record = asRecord(data);
  if (!record) return [];
  for (const key of ["result", "data", "items", "campaigns", "rows", "statistics"]) {
    const v = record[key];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  // Single object that looks like a row
  if ("id" in record || "date" in record || "balance" in record) return [record];
  return [];
}

export function parseTrafficFactorySessionToken(text: string): string {
  try {
    const data = JSON.parse(text);
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        if (/token/i.test(key) && typeof obj[key] === "string" && (obj[key] as string).trim()) {
          return (obj[key] as string).trim();
        }
      }
    }
  } catch {
    const stripped = text.replace(/^"|"$/g, "").trim();
    if (stripped) return stripped;
  }
  throw new Error(`Tidak menemukan session token di respons login Traffic Factory: ${text.slice(0, 300)}`);
}

/**
 * Compatibility auth: POST /login with api_token → session string.
 * Retained from existing connector; public docs were not available to re-verify.
 */
export async function getTrafficFactorySessionToken(
  apiToken: string,
  fetchFn: TfFetch = fetch
): Promise<string> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_token: apiToken }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Login Traffic Factory gagal (${res.status}). Respons: ${text.slice(0, 300)}`);
  }
  return parseTrafficFactorySessionToken(text);
}

/**
 * UI formats network balance as USD (`$`). Persist balance only when currency is
 * missing (unknown) or USD — never mix EUR/other into the same numeric field.
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

export async function getTrafficFactoryUser(
  sessionToken: string,
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryUserInfo> {
  const res = await fetchFn(`${TRAFFIC_FACTORY_BASE_URL}/user`, {
    headers: authHeaders(sessionToken),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gagal mengambil /user Traffic Factory (${res.status}). Respons: ${text.slice(0, 300)}`);
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
    pickFirstString(row, ["id", "campaign_id", "campaignId"]) ??
    (typeof row.campaign === "number" || typeof row.campaign === "string" ? String(row.campaign) : null);
  if (!id) return null;

  const name =
    pickFirstString(row, ["name", "campaign_name", "title", "label"]) ?? `Traffic Factory ${id}`;

  const statusRaw =
    row.status ?? row.state ?? row.campaign_status ?? row.enabled ?? row.active;

  return {
    externalId: id,
    name,
    status: mapTrafficFactoryCampaignStatus(statusRaw),
  };
}

async function fetchPaginatedRecords(
  sessionToken: string,
  path: string,
  extraParams: Record<string, string>,
  fetchFn: TfFetch
): Promise<PaginatedResult<Record<string, unknown>>> {
  const items: Record<string, unknown>[] = [];
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${TRAFFIC_FACTORY_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("per_page", String(DEFAULT_PAGE_SIZE));

    const res = await fetchFn(url, { headers: authHeaders(sessionToken) });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gagal mengambil ${path} Traffic Factory (${res.status}). Respons: ${text.slice(0, 300)}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Respons ${path} Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
    }

    const batch = unwrapList(data);
    pagesFetched += 1;
    items.push(...batch);

    if (batch.length === 0 || batch.length < DEFAULT_PAGE_SIZE) break;
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
  /** True when a spend-like key other than allowlist appeared (not mapped). */
  skippedUnverifiedSpendKey: boolean;
};

export function parseTrafficFactoryDailyStatRow(row: Record<string, unknown>): ParsedDailyStat | null {
  const dateRaw =
    pickFirstString(row, ["date", "stat_date", "day"]) ??
    (typeof row.datetime === "string" ? row.datetime.slice(0, 10) : null);
  if (!dateRaw) return null;
  const date = dateRaw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  // Do NOT use bare `id` — on /statistics/a/date it may be a row id, not campaign id.
  let campaignExternalId = pickFirstString(row, ["campaign_id", "campaignId"]);
  if (!campaignExternalId && row.campaign != null && typeof row.campaign !== "object") {
    campaignExternalId = String(row.campaign);
  }
  if (!campaignExternalId) {
    const nested = asRecord(row.campaign);
    if (nested) {
      campaignExternalId = pickFirstString(nested, ["id", "campaign_id", "campaignId"]);
    }
  }

  // `value` may coexist with `cost` — still never map `value` to spend.
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

/**
 * Daily advertiser statistics: GET /statistics/a/date
 * Uses explicit date filters + page/limit pagination.
 */
export async function getTrafficFactoryDailyStats(
  sessionToken: string,
  dateFrom: string,
  dateTo: string,
  fetchFn: TfFetch = fetch
): Promise<PaginatedResult<ParsedDailyStat>> {
  const { items, pagesFetched } = await fetchPaginatedRecords(
    sessionToken,
    "/statistics/a/date",
    {
      "filter[date_from]": dateFrom,
      "filter[date_to]": dateTo,
      date_from: dateFrom,
      date_to: dateTo,
    },
    fetchFn
  );

  const parsed: ParsedDailyStat[] = [];
  for (const row of items) {
    const p = parseTrafficFactoryDailyStatRow(row);
    if (p) parsed.push(p);
  }
  return { items: parsed, pagesFetched };
}

/** @deprecated Prefer getTrafficFactoryDailyStats; kept for compatibility during transition. */
export async function getTrafficFactoryStats(
  sessionToken: string,
  dateFrom: string,
  dateTo: string,
  groupBy: string[] = ["date", "campaign"],
  fetchFn: TfFetch = fetch
): Promise<TrafficFactoryStatRow[]> {
  void groupBy;
  const { items } = await getTrafficFactoryDailyStats(sessionToken, dateFrom, dateTo, fetchFn);
  return items.map((r) => ({
    date: r.date,
    campaign_id: r.campaignExternalId,
    cost: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
  }));
}
