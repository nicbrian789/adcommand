const BASE_URL = "https://api.trafficstars.com";

export type TrafficStarsCampaign = { id: number; name: string; status: string };

export type TrafficStarsDailyStat = {
  name: string;
  impressions: number;
  clicks: number;
  leads: number;
  costs: number;
  earnings: number;
};

export async function getTrafficStarsAccessToken(apiKey: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: apiKey }),
  });

  if (!res.ok) {
    throw new Error(`Autentikasi TrafficStars gagal (${res.status})`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getTrafficStarsBalance(accessToken: string): Promise<number | null> {
  const res = await fetch(`${BASE_URL}/v2/userinfo/balance`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { balance?: number };
  return typeof data.balance === "number" ? data.balance : null;
}

export async function listTrafficStarsCampaigns(accessToken: string): Promise<TrafficStarsCampaign[]> {
  const res = await fetch(`${BASE_URL}/v1.1/campaigns`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar campaign (${res.status})`);
  }

  const data = (await res.json()) as { response: TrafficStarsCampaign[] };
  return data.response ?? [];
}

export async function getTrafficStarsSiteStats(
  accessToken: string,
  campaignId: number,
  dateFrom: string,
  dateTo: string
): Promise<TrafficStarsDailyStat[]> {
  const res = await fetch(`${BASE_URL}/v2/campaigns/statistics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date_from: dateFrom,
      date_to: dateTo,
      group_by: "site",
      campaigns: [campaignId],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik situs campaign ${campaignId} (${res.status})`);
  }

  const data = (await res.json()) as { data: TrafficStarsDailyStat[] };
  return data.data ?? [];
}

export async function getTrafficStarsCountryStats(
  accessToken: string,
  campaignId: number,
  day: string
): Promise<TrafficStarsDailyStat[]> {
  const res = await fetch(`${BASE_URL}/v2/campaigns/statistics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date_from: day,
      date_to: day,
      group_by: "country",
      campaigns: [campaignId],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik negara campaign ${campaignId} (${res.status})`);
  }

  const data = (await res.json()) as { data: TrafficStarsDailyStat[] };
  return data.data ?? [];
}

export type TrafficStarsAdFormat = {
  id: number;
  name: string;
  type_id: number;
  type: string;
  ad_types: { id: string; name: string }[];
};

export async function getTrafficStarsAdFormats(accessToken: string): Promise<TrafficStarsAdFormat[]> {
  const res = await fetch(`${BASE_URL}/v1.1/ad_formats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar format iklan (${res.status})`);
  }

  const data = (await res.json()) as TrafficStarsAdFormat[] | { response: TrafficStarsAdFormat[] };
  return Array.isArray(data) ? data : (data.response ?? []);
}

export type CreateTrafficStarsCampaignInput = {
  name: string;
  formatId: number;
  adType: string;
  pricingModel: "cpm" | "cpc" | "cpa";
  price: number;
  maxDaily?: number;
  countries?: string[];
};

export async function createTrafficStarsCampaign(
  accessToken: string,
  input: CreateTrafficStarsCampaignInput
): Promise<{ id: number; status: string }> {
  const body: Record<string, unknown> = {
    name: input.name,
    format_id: input.formatId,
    type: input.adType,
    ad_type: input.adType,
    pricing_model: input.pricingModel,
    price: input.price,
    hours_targeting: "1".repeat(24),
  };
  if (input.maxDaily && input.maxDaily > 0) body.max_daily = input.maxDaily;
  if (input.countries && input.countries.length > 0) body.countries = input.countries;

  const res = await fetch(`${BASE_URL}/v1.1/campaigns`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal bikin campaign TrafficStars (${res.status}): ${text.slice(0, 400)}`);
  }

  return res.json();
}

export async function getTrafficStarsDailyStats(
  accessToken: string,
  campaignId: number,
  dateFrom: string,
  dateTo: string
): Promise<TrafficStarsDailyStat[]> {
  const res = await fetch(`${BASE_URL}/v2/campaigns/statistics`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date_from: dateFrom,
      date_to: dateTo,
      group_by: "date",
      campaigns: [campaignId],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik campaign ${campaignId} (${res.status})`);
  }

  const data = (await res.json()) as { data: TrafficStarsDailyStat[] };
  return data.data ?? [];
}
