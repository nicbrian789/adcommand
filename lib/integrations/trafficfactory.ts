const BASE_URL = "https://api.trafficfactory.com/v2";

export async function getTrafficFactorySessionToken(apiToken: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_token: apiToken }),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Login Traffic Factory gagal (${res.status}). Respons: ${text.slice(0, 300)}`);
  }

  try {
    const data = JSON.parse(text);
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const key = Object.keys(data).find((k) => /token/i.test(k));
      if (key && typeof (data as Record<string, unknown>)[key] === "string") {
        return (data as Record<string, string>)[key];
      }
    }
  } catch {
    return text.replace(/^"|"$/g, "").trim();
  }

  throw new Error(`Tidak menemukan session token di respons login Traffic Factory: ${text.slice(0, 300)}`);
}

export type TrafficFactoryStatRow = Record<string, unknown>;

export async function getTrafficFactoryStats(
  sessionToken: string,
  dateFrom: string,
  dateTo: string,
  groupBy: string[] = ["date", "campaign"]
): Promise<TrafficFactoryStatRow[]> {
  const url = new URL(`${BASE_URL}/statistics/a/campaign`);
  url.searchParams.set("filter[date_from]", dateFrom);
  url.searchParams.set("filter[date_to]", dateTo);
  for (const g of groupBy) {
    url.searchParams.append("group_by[]", g);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${sessionToken}`, Accept: "application/json" },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik Traffic Factory (${res.status}). Respons: ${text.slice(0, 300)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respons statistik Traffic Factory bukan JSON: ${text.slice(0, 300)}`);
  }

  const record = data as Record<string, unknown>;
  const rows: TrafficFactoryStatRow[] = Array.isArray(data)
    ? (data as TrafficFactoryStatRow[])
    : Array.isArray(record?.result)
      ? (record.result as TrafficFactoryStatRow[])
      : Array.isArray(record?.data)
        ? (record.data as TrafficFactoryStatRow[])
        : Array.isArray(record?.items)
          ? (record.items as TrafficFactoryStatRow[])
          : [];

  return rows;
}
