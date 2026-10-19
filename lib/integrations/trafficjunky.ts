const BASE_URL = "https://api.trafficjunky.com/api";

export type TrafficJunkyStatItem = {
  campaign_id: number;
  campaign_name: string;
  impressions: number;
  clicks: number;
  ecpm: number;
  ecpc: number;
  conversions: number;
};

function formatDate(d: Date) {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function getTrafficJunkyBalance(token: string): Promise<number | null> {
  const res = await fetch(`${BASE_URL}/member.json`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) return null;

  try {
    const data = (await res.json()) as Record<string, unknown>;
    const key = Object.keys(data).find((k) => /balance|fund|credit/i.test(k));
    if (!key) return null;
    const value = Number(data[key]);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function getTrafficJunkyStats(
  token: string,
  dateFrom: Date,
  dateTo: Date
): Promise<TrafficJunkyStatItem[]> {
  const url = new URL(`${BASE_URL}/campaigns/stats.json`);
  url.searchParams.set("startDate", formatDate(dateFrom));
  url.searchParams.set("endDate", formatDate(dateTo));
  url.searchParams.set("limit", "100");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik TrafficJunky (${res.status}). Respons: ${text.slice(0, 300)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Respons TrafficJunky bukan JSON. Isi: ${text.slice(0, 300)}`);
  }

  const items: TrafficJunkyStatItem[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      items.push(...(value as TrafficJunkyStatItem[]));
    } else if (value && typeof value === "object") {
      items.push({ campaign_id: Number(key), ...(value as object) } as TrafficJunkyStatItem);
    }
  }

  return items;
}
