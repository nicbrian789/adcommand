/** Pure metric helpers for AI assistant (no network / no secrets). */

export type MetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

export function emptyTotals(): MetricTotals {
  return { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
}

export function addTotals(target: MetricTotals, row: Partial<MetricTotals>) {
  target.spend += Number(row.spend ?? 0);
  target.impressions += Number(row.impressions ?? 0);
  target.clicks += Number(row.clicks ?? 0);
  target.conversions += Number(row.conversions ?? 0);
  target.revenue += Number(row.revenue ?? 0);
}

/** Cost per result = spend / conversions. Null when conversions are 0. */
export function costPerResult(spend: number, conversions: number): number | null {
  if (conversions <= 0) return null;
  return spend / conversions;
}

export function ctr(clicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return clicks / impressions;
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatPct(ratio: number | null): string {
  if (ratio === null) return "n/a";
  return `${(ratio * 100).toFixed(2)}%`;
}

export function formatCpr(cpr: number | null): string {
  if (cpr === null) return "n/a (belum ada konversi)";
  return formatMoney(cpr);
}

export type RankedCampaign = {
  id: string;
  name: string;
  networkName: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cpr: number | null;
  ctr: number | null;
};

/** Highest CPR first; campaigns without conversions ranked by spend descending after. */
export function rankByExpensiveCpr(rows: RankedCampaign[]): RankedCampaign[] {
  return [...rows].sort((a, b) => {
    if (a.cpr !== null && b.cpr !== null) return b.cpr - a.cpr;
    if (a.cpr !== null) return -1;
    if (b.cpr !== null) return 1;
    return b.spend - a.spend;
  });
}
