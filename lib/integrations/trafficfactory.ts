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

/**
 * TrafficFactory punya endpoint statistik terpisah per dimensi (date, campaign, country, dst),
 * bukan satu endpoint generik dengan parameter group_by bebas. Field tanggal di endpoint
 * "a/date" namanya "ddate", dan "additional_group_by=campaign" dipakai buat nambah breakdown
 * campaign ke hasilnya. Lihat https://api.trafficfactory.com/v2/docs/#!/47statistics.
 */
async function getAdvertiserStats(
  sessionToken: string,
  kind: "date" | "country",
  dateFrom: string,
  dateTo: string
): Promise<TrafficFactoryStatRow[]> {
  const rows: TrafficFactoryStatRow[] = [];
  const limit = 500;
  let offset = 0;

  for (let page = 0; page < 20; page++) {
    const url = new URL(`${BASE_URL}/statistics/a/${kind}`);
    url.searchParams.set("date-from", dateFrom);
    url.searchParams.set("date-to", dateTo);
    url.searchParams.set("additional_group_by", "campaign");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

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
    const pageRows = Array.isArray(record?.result) ? (record.result as TrafficFactoryStatRow[]) : [];
    rows.push(...pageRows);

    if (pageRows.length < limit) break;
    offset += limit;
  }

  return rows;
}

export async function getTrafficFactoryStatsByDate(
  sessionToken: string,
  dateFrom: string,
  dateTo: string
): Promise<TrafficFactoryStatRow[]> {
  return getAdvertiserStats(sessionToken, "date", dateFrom, dateTo);
}

export async function getTrafficFactoryStatsByCountry(
  sessionToken: string,
  dateFrom: string,
  dateTo: string
): Promise<TrafficFactoryStatRow[]> {
  return getAdvertiserStats(sessionToken, "country", dateFrom, dateTo);
}
