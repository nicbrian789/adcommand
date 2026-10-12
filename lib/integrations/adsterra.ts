const BASE_URL = "https://api3.adsterratools.com/advertiser";

export type AdsterraStatRow = Record<string, unknown>;

export async function getAdsterraBalance(apiKey: string): Promise<number | null> {
  const res = await fetch(`${BASE_URL}/balance.json`, {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { item?: string | number };
  const value = Number(data.item);
  return Number.isFinite(value) ? value : null;
}

export async function getAdsterraStats(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  groupBy: string[]
): Promise<AdsterraStatRow[]> {
  const url = new URL(`${BASE_URL}/stats.json`);
  url.searchParams.set("start_date", dateFrom);
  url.searchParams.set("finish_date", dateTo);
  for (const g of groupBy) {
    url.searchParams.append("group_by[]", g);
  }

  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik Adsterra (${res.status})`);
  }

  const data = (await res.json()) as { items?: AdsterraStatRow[] };
  return data.items ?? [];
}
