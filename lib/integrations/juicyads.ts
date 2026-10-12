const BASE_URL = "https://api.juicyads.com";

export type JuicyAdsCampaign = {
  id: string;
  campaign_name: string | null;
  active: string | number | boolean;
};

export type JuicyAdsDailyStat = {
  thedate: string;
  spend: string | number;
  imps: string | number;
};

export async function listJuicyAdsCampaigns(token: string): Promise<JuicyAdsCampaign[]> {
  const res = await fetch(`${BASE_URL}/campaigns/popunders/${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil daftar campaign JuicyAds (${res.status})`);
  }

  return (await res.json()) as JuicyAdsCampaign[];
}

export async function getJuicyAdsDailyStats(
  token: string,
  campaignId: string,
  dateFrom: string,
  dateTo: string
): Promise<JuicyAdsDailyStat[]> {
  const path = [
    "statistics/popunders/advertiser",
    encodeURIComponent(token),
    encodeURIComponent(campaignId),
    dateFrom,
    dateTo,
  ].join("/");

  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Gagal mengambil statistik campaign JuicyAds ${campaignId} (${res.status})`);
  }

  return (await res.json()) as JuicyAdsDailyStat[];
}
