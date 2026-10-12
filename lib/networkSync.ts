import type { SupabaseClient } from "@supabase/supabase-js";
import { networkTypeLabel } from "@/lib/networks";
import { countryToCode } from "@/lib/countries";
import { raiseAlert, hasRecentAlert } from "@/lib/alerts";
import {
  getTrafficStarsAccessToken,
  getTrafficStarsBalance,
  getTrafficStarsCountryStats,
  getTrafficStarsDailyStats,
  getTrafficStarsSiteStats,
  listTrafficStarsCampaigns,
} from "@/lib/integrations/trafficstars";
import { getAdsterraBalance, getAdsterraStats } from "@/lib/integrations/adsterra";
import { getJuicyAdsDailyStats, listJuicyAdsCampaigns } from "@/lib/integrations/juicyads";
import { getTrafficJunkyBalance, getTrafficJunkyStats } from "@/lib/integrations/trafficjunky";
import { getTrafficFactorySessionToken, getTrafficFactoryStats } from "@/lib/integrations/trafficfactory";

type Supabase = SupabaseClient;

type StatRow = {
  workspace_id: string;
  campaign_id: string;
  stat_date: string;
  country: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  revenue: number | null;
};

const ALL = "ALL";
const LOW_BALANCE_THRESHOLD = 20;
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CTR_DROP_MIN_IMPRESSIONS = 100;
const CTR_DROP_RATIO = 0.5;
const statusMap: Record<string, string> = { enabled: "Running", paused: "Paused" };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function sevenDayRange() {
  return {
    dateFrom: isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    dateTo: isoDate(new Date()),
  };
}

function daysBetween(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function normalizeCountry(value: unknown): string | null {
  return countryToCode(value);
}

async function upsertCampaign(
  supabase: Supabase,
  workspaceId: string,
  networkId: string,
  externalId: string,
  name: string,
  status: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("network_id", networkId)
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("campaigns").update({ name, status }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from("campaigns")
    .insert({ workspace_id: workspaceId, network_id: networkId, external_id: externalId, name, status })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

type SiteRow = {
  workspace_id: string;
  campaign_id: string;
  site_key: string;
  stat_date: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
};

async function saveSiteStats(supabase: Supabase, rows: SiteRow[]) {
  const merged = new Map<string, SiteRow>();
  for (const r of rows) {
    const key = `${r.campaign_id}|${r.site_key}|${r.stat_date}`;
    const m = merged.get(key);
    if (!m) {
      merged.set(key, { ...r });
      continue;
    }
    m.spend = Number(m.spend ?? 0) + Number(r.spend ?? 0);
    m.impressions = Number(m.impressions ?? 0) + Number(r.impressions ?? 0);
    m.clicks = Number(m.clicks ?? 0) + Number(r.clicks ?? 0);
    m.conversions = Number(m.conversions ?? 0) + Number(r.conversions ?? 0);
  }

  const unique = [...merged.values()];
  if (unique.length === 0) return 0;
  const { error } = await supabase
    .from("site_stats")
    .upsert(unique, { onConflict: "campaign_id,site_key,stat_date" });
  if (error) throw new Error(error.message);
  return unique.length;
}

async function saveBalance(supabase: Supabase, networkId: string, balance: number | null) {
  if (balance === null) return;
  const { error } = await supabase
    .from("ad_networks")
    .update({ balance, balance_checked_at: new Date().toISOString() })
    .eq("id", networkId);
  if (error) throw new Error(error.message);
}

async function saveStats(supabase: Supabase, rows: StatRow[]) {
  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from("campaign_stats")
    .upsert(rows, { onConflict: "campaign_id,stat_date,country" });
  if (error) throw new Error(error.message);
  return rows.length;
}

async function syncTrafficStars(supabase: Supabase, network: { id: string; workspace_id: string }, apiKey: string) {
  const { dateFrom, dateTo } = sevenDayRange();
  const days = daysBetween(dateFrom, dateTo);
  const accessToken = await getTrafficStarsAccessToken(apiKey);
  await saveBalance(supabase, network.id, await getTrafficStarsBalance(accessToken));
  const tsCampaigns = await listTrafficStarsCampaigns(accessToken);

  const perCampaignSaved = await Promise.all(
    tsCampaigns.map(async (tc) => {
      const campaignId = await upsertCampaign(
        supabase,
        network.workspace_id,
        network.id,
        String(tc.id),
        tc.name,
        statusMap[tc.status] ?? "Stopped"
      );

      let saved = 0;

      const [totals, geoByDay, sites] = await Promise.all([
        getTrafficStarsDailyStats(accessToken, tc.id, dateFrom, dateTo),
        Promise.all(days.map((day) => getTrafficStarsCountryStats(accessToken, tc.id, day))),
        getTrafficStarsSiteStats(accessToken, tc.id, dateFrom, dateTo),
      ]);

      saved += await saveStats(
        supabase,
        totals.map((s) => ({
          workspace_id: network.workspace_id,
          campaign_id: campaignId,
          stat_date: s.name.slice(0, 10),
          country: ALL,
          spend: s.costs,
          impressions: s.impressions,
          clicks: s.clicks,
          conversions: s.leads,
          revenue: s.earnings,
        }))
      );

      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const geo = geoByDay[i];
        const rows: StatRow[] = [];
        for (const s of geo) {
          const country = normalizeCountry(s.name);
          if (!country) continue;
          rows.push({
            workspace_id: network.workspace_id,
            campaign_id: campaignId,
            stat_date: day,
            country,
            spend: s.costs,
            impressions: s.impressions,
            clicks: s.clicks,
            conversions: s.leads,
            revenue: s.earnings,
          });
        }
        saved += await saveStats(supabase, rows);
      }

      await saveSiteStats(
        supabase,
        sites
          .filter((s) => s.name)
          .map((s) => ({
            workspace_id: network.workspace_id,
            campaign_id: campaignId,
            site_key: String(s.name),
            stat_date: dateTo,
            spend: s.costs,
            impressions: s.impressions,
            clicks: s.clicks,
            conversions: s.leads,
          }))
      );

      return saved;
    })
  );

  const saved = perCampaignSaved.reduce((sum, n) => sum + n, 0);

  return { campaigns: tsCampaigns.length, days: saved };
}

function findKey(item: Record<string, unknown>, test: (k: string) => boolean) {
  return Object.keys(item).find(test);
}

async function syncAdsterra(supabase: Supabase, network: { id: string; workspace_id: string }, apiKey: string) {
  const { dateFrom, dateTo } = sevenDayRange();

  await saveBalance(supabase, network.id, await getAdsterraBalance(apiKey));
  const totals = await getAdsterraStats(apiKey, dateFrom, dateTo, ["date", "campaign"]);
  if (totals.length === 0) return { campaigns: 0, days: 0 };

  const sample = totals[0];
  const idKey = findKey(sample, (k) => /campaign/i.test(k) && /id/i.test(k)) ?? findKey(sample, (k) => k === "campaign");
  const nameKey = findKey(sample, (k) => /campaign/i.test(k) && /name/i.test(k));

  if (!idKey) {
    throw new Error(`Field ID campaign tidak ditemukan di respons Adsterra. Field yang ada: ${Object.keys(sample).join(", ")}`);
  }

  const campaignIds = new Map<string, string>();
  for (const item of totals) {
    const externalId = String(item[idKey]);
    if (!campaignIds.has(externalId)) {
      const campaignId = await upsertCampaign(
        supabase,
        network.workspace_id,
        network.id,
        externalId,
        nameKey && item[nameKey] ? String(item[nameKey]) : `Adsterra ${externalId}`,
        "Running"
      );
      campaignIds.set(externalId, campaignId);
    }
  }

  let saved = await saveStats(
    supabase,
    totals.map((item) => ({
      workspace_id: network.workspace_id,
      campaign_id: campaignIds.get(String(item[idKey]))!,
      stat_date: String(item.date).slice(0, 10),
      country: ALL,
      spend: Number(item.spent ?? 0),
      impressions: Number(item.impressions ?? 0),
      clicks: Number(item.clicks ?? 0),
      conversions: Number(item.conversions ?? 0),
      revenue: null,
    }))
  );

  const geo = await getAdsterraStats(apiKey, dateFrom, dateTo, ["date", "campaign", "country"]);
  if (geo.length > 0) {
    const countryKey = findKey(geo[0], (k) => /country/i.test(k));
    if (!countryKey) {
      throw new Error(`Field negara tidak ditemukan di respons Adsterra. Field yang ada: ${Object.keys(geo[0]).join(", ")}`);
    }

    const rows: StatRow[] = [];
    for (const item of geo) {
      const campaignId = campaignIds.get(String(item[idKey]));
      const country = normalizeCountry(item[countryKey]);
      if (!campaignId || !country) continue;
      rows.push({
        workspace_id: network.workspace_id,
        campaign_id: campaignId,
        stat_date: String(item.date).slice(0, 10),
        country,
        spend: Number(item.spent ?? 0),
        impressions: Number(item.impressions ?? 0),
        clicks: Number(item.clicks ?? 0),
        conversions: Number(item.conversions ?? 0),
        revenue: null,
      });
    }
    saved += await saveStats(supabase, rows);
  }

  const landings = await getAdsterraStats(apiKey, dateFrom, dateTo, ["date", "campaign", "landing"]);
  if (landings.length > 0) {
    const landingKey = findKey(landings[0], (k) => /landing/i.test(k));
    if (landingKey) {
      await saveSiteStats(
        supabase,
        landings
          .filter((item) => item[landingKey] !== undefined && item[landingKey] !== null && campaignIds.has(String(item[idKey])))
          .map((item) => ({
            workspace_id: network.workspace_id,
            campaign_id: campaignIds.get(String(item[idKey]))!,
            site_key: `Landing ${String(item[landingKey])}`,
            stat_date: String(item.date).slice(0, 10),
            spend: Number(item.spent ?? 0),
            impressions: Number(item.impressions ?? 0),
            clicks: Number(item.clicks ?? 0),
            conversions: Number(item.conversions ?? 0),
          }))
      );
    }
  }

  return { campaigns: campaignIds.size, days: saved };
}

async function syncJuicyAds(supabase: Supabase, network: { id: string; workspace_id: string }, token: string) {
  const { dateFrom, dateTo } = sevenDayRange();
  const jCampaigns = await listJuicyAdsCampaigns(token);

  let saved = 0;
  for (const jc of jCampaigns) {
    const externalId = String(jc.id);
    const isActive = String(jc.active) === "1" || String(jc.active) === "true";
    const campaignId = await upsertCampaign(
      supabase,
      network.workspace_id,
      network.id,
      externalId,
      jc.campaign_name || `JuicyAds ${externalId}`,
      isActive ? "Running" : "Paused"
    );

    const stats = await getJuicyAdsDailyStats(token, externalId, dateFrom, dateTo);
    saved += await saveStats(
      supabase,
      stats.map((s) => ({
        workspace_id: network.workspace_id,
        campaign_id: campaignId,
        stat_date: String(s.thedate).slice(0, 10),
        country: ALL,
        spend: Number(s.spend ?? 0),
        impressions: Number(s.imps ?? 0),
        clicks: null,
        conversions: null,
        revenue: null,
      }))
    );
  }

  return { campaigns: jCampaigns.length, days: saved };
}

async function syncTrafficJunky(supabase: Supabase, network: { id: string; workspace_id: string }, token: string) {
  await saveBalance(supabase, network.id, await getTrafficJunkyBalance(token));

  const { dateFrom, dateTo } = sevenDayRange();
  const days = daysBetween(dateFrom, dateTo);

  const campaignIds = new Set<string>();
  let saved = 0;

  const itemsByDay = await Promise.all(
    days.map((day) => {
      const d = new Date(`${day}T00:00:00Z`);
      return getTrafficJunkyStats(token, d, d);
    })
  );

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const items = itemsByDay[i];

    const rows: StatRow[] = [];
    for (const item of items) {
      const externalId = String(item.campaign_id);
      campaignIds.add(externalId);
      const campaignId = await upsertCampaign(
        supabase,
        network.workspace_id,
        network.id,
        externalId,
        item.campaign_name || `TrafficJunky ${externalId}`,
        "Running"
      );

      const clicks = Number(item.clicks ?? 0);
      const impressions = Number(item.impressions ?? 0);
      const ecpc = Number(item.ecpc ?? 0);
      const ecpm = Number(item.ecpm ?? 0);
      const spend = clicks > 0 && ecpc > 0 ? clicks * ecpc : impressions > 0 && ecpm > 0 ? (impressions / 1000) * ecpm : 0;

      rows.push({
        workspace_id: network.workspace_id,
        campaign_id: campaignId,
        stat_date: day,
        country: ALL,
        spend,
        impressions,
        clicks,
        conversions: Number(item.conversions ?? 0),
        revenue: null,
      });
    }
    saved += await saveStats(supabase, rows);
  }

  return { campaigns: campaignIds.size, days: saved };
}

async function syncTrafficFactory(supabase: Supabase, network: { id: string; workspace_id: string }, token: string) {
  const { dateFrom, dateTo } = sevenDayRange();
  const sessionToken = await getTrafficFactorySessionToken(token);
  const rows = await getTrafficFactoryStats(sessionToken, dateFrom, dateTo);

  if (rows.length === 0) return { campaigns: 0, days: 0 };

  const sample = rows[0];
  const idKey = findKey(sample, (k) => /campaign/i.test(k) && /id/i.test(k)) ?? findKey(sample, (k) => k.toLowerCase() === "campaign");
  const nameKey = findKey(sample, (k) => /campaign/i.test(k) && /name/i.test(k));
  const dateKey = findKey(sample, (k) => k.toLowerCase() === "date") ?? findKey(sample, (k) => /date/i.test(k));
  const costKey = findKey(sample, (k) => /cost|spend/i.test(k));
  const impKey = findKey(sample, (k) => /impression/i.test(k));
  const clickKey = findKey(sample, (k) => /click/i.test(k));

  if (!idKey || !dateKey) {
    throw new Error(
      `Field campaign/tanggal tidak ditemukan di respons Traffic Factory. Field yang ada: ${Object.keys(sample).join(", ")}`
    );
  }

  const campaignIds = new Map<string, string>();
  const rows_: StatRow[] = [];

  for (const item of rows) {
    const externalId = String(item[idKey]);
    if (!campaignIds.has(externalId)) {
      const campaignId = await upsertCampaign(
        supabase,
        network.workspace_id,
        network.id,
        externalId,
        nameKey && item[nameKey] ? String(item[nameKey]) : `Traffic Factory ${externalId}`,
        "Running"
      );
      campaignIds.set(externalId, campaignId);
    }

    rows_.push({
      workspace_id: network.workspace_id,
      campaign_id: campaignIds.get(externalId)!,
      stat_date: String(item[dateKey]).slice(0, 10),
      country: ALL,
      spend: costKey ? Number(item[costKey] ?? 0) : null,
      impressions: impKey ? Number(item[impKey] ?? 0) : null,
      clicks: clickKey ? Number(item[clickKey] ?? 0) : null,
      conversions: null,
      revenue: null,
    });
  }

  let saved = await saveStats(supabase, rows_);

  const geoRows = await getTrafficFactoryStats(sessionToken, dateFrom, dateTo, ["date", "campaign", "country"]);
  if (geoRows.length > 0) {
    const countryKey = findKey(geoRows[0], (k) => /country/i.test(k));
    if (countryKey) {
      const geoStatRows: StatRow[] = [];
      for (const item of geoRows) {
        const externalId = String(item[idKey]);
        const campaignId = campaignIds.get(externalId);
        const country = countryToCode(item[countryKey]);
        if (!campaignId || !country) continue;
        geoStatRows.push({
          workspace_id: network.workspace_id,
          campaign_id: campaignId,
          stat_date: String(item[dateKey]).slice(0, 10),
          country,
          spend: costKey ? Number(item[costKey] ?? 0) : null,
          impressions: impKey ? Number(item[impKey] ?? 0) : null,
          clicks: clickKey ? Number(item[clickKey] ?? 0) : null,
          conversions: null,
          revenue: null,
        });
      }
      saved += await saveStats(supabase, geoStatRows);
    }
  }

  return { campaigns: campaignIds.size, days: saved };
}

async function checkCampaignHealth(
  supabase: Supabase,
  network: { id: string; name: string; workspace_id: string },
  ownerLabel: string,
  campaignIds: string[]
) {
  if (campaignIds.length === 0) return;

  const { data: stats } = await supabase
    .from("campaign_stats")
    .select("campaign_id, stat_date, clicks, impressions, spend")
    .eq("country", ALL)
    .in("campaign_id", campaignIds)
    .order("stat_date", { ascending: true });

  const { data: campaigns } = await supabase.from("campaigns").select("id, name, status").in("id", campaignIds);
  const nameOf = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const statusOf = new Map((campaigns ?? []).map((c) => [c.id, c.status]));

  const byCampaign = new Map<string, { stat_date: string; clicks: number; impressions: number; spend: number }[]>();
  for (const s of stats ?? []) {
    const arr = byCampaign.get(s.campaign_id) ?? [];
    arr.push({
      stat_date: s.stat_date,
      clicks: Number(s.clicks ?? 0),
      impressions: Number(s.impressions ?? 0),
      spend: Number(s.spend ?? 0),
    });
    byCampaign.set(s.campaign_id, arr);
  }

  for (const [campaignId, rows] of byCampaign) {
    if (rows.length < 4) continue;
    const name = nameOf.get(campaignId) ?? "(tanpa nama)";
    const latest = rows[rows.length - 1];
    const prior = rows.slice(0, -1);

    const priorWithImpressions = prior.filter((p) => p.impressions > 0);
    if (latest.impressions >= CTR_DROP_MIN_IMPRESSIONS && priorWithImpressions.length >= 3) {
      const avgCtr = priorWithImpressions.reduce((sum, p) => sum + p.clicks / p.impressions, 0) / priorWithImpressions.length;
      const latestCtr = latest.clicks / latest.impressions;
      if (avgCtr > 0 && latestCtr < avgCtr * CTR_DROP_RATIO) {
        const titleSuffix = `CTR anjlok: ${name}`;
        if (!(await hasRecentAlert(supabase, { networkId: network.id, type: "ctr_drop", titleSuffix, cooldownMs: ALERT_COOLDOWN_MS }))) {
          await raiseAlert(supabase, {
            workspaceId: network.workspace_id,
            networkId: network.id,
            type: "ctr_drop",
            title: `[${ownerLabel}] ${titleSuffix}`,
            message: `CTR campaign "${name}" di ${network.name} turun dari rata-rata ${(avgCtr * 100).toFixed(2)}% jadi ${(latestCtr * 100).toFixed(2)}% pada ${latest.stat_date}.`,
          });
        }
      }
    }

    const last3 = rows.slice(-3);
    const earlierHadActivity = rows.slice(0, -3).some((r) => r.spend > 0 || r.clicks > 0);
    const last3Flat = last3.length === 3 && last3.every((r) => r.spend === 0 && r.clicks === 0);
    if (last3Flat && earlierHadActivity && statusOf.get(campaignId) === "Running") {
      const titleSuffix = `Tidak ada aktivitas: ${name}`;
      if (!(await hasRecentAlert(supabase, { networkId: network.id, type: "no_activity", titleSuffix, cooldownMs: ALERT_COOLDOWN_MS }))) {
        await raiseAlert(supabase, {
          workspaceId: network.workspace_id,
          networkId: network.id,
          type: "no_activity",
          title: `[${ownerLabel}] ${titleSuffix}`,
          message: `Campaign "${name}" di ${network.name} berstatus Running tapi 3 hari terakhir tidak ada spend/klik.`,
        });
      }
    }
  }
}

export type NetworkRef = { id: string; name: string; workspace_id: string; provider: string | null; user_id: string };

/** Jalanin sync + semua pengecekan alert buat 1 network. Dipakai baik dari tombol Sync manual maupun cron otomatis. */
export async function runNetworkSync(
  supabase: Supabase,
  network: NetworkRef,
  apiKey: string
): Promise<{ campaigns: number; days: number }> {
  const { data: ownerProfile, error: ownerProfileError } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", network.user_id)
    .maybeSingle();
  if (ownerProfileError) console.error("Gagal ambil nama pemilik network:", ownerProfileError.message);
  const ownerLabel = ownerProfile?.full_name || ownerProfile?.email || "tanpa nama";

  const { data: beforeCampaigns } = await supabase.from("campaigns").select("id").eq("network_id", network.id);
  const beforeIds = new Set((beforeCampaigns ?? []).map((c) => c.id));

  let result: { campaigns: number; days: number };
  try {
    result =
      network.provider === "adsterra"
        ? await syncAdsterra(supabase, network, apiKey)
        : network.provider === "juicyads"
          ? await syncJuicyAds(supabase, network, apiKey)
          : network.provider === "trafficjunky"
            ? await syncTrafficJunky(supabase, network, apiKey)
            : network.provider === "traffic_factory"
              ? await syncTrafficFactory(supabase, network, apiKey)
              : await syncTrafficStars(supabase, network, apiKey);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    await raiseAlert(supabase, {
      workspaceId: network.workspace_id,
      networkId: network.id,
      type: "sync_failed",
      title: `[${ownerLabel}] Sync gagal: ${network.name}`,
      message: `Network ${networkTypeLabel(network.provider)} "${network.name}" (punya ${ownerLabel}) gagal sinkron. Alasan: ${reason}`,
    });
    throw err;
  }

  await supabase.from("ad_networks").update({ last_synced_at: new Date().toISOString() }).eq("id", network.id);

  const { data: refreshed } = await supabase
    .from("ad_networks")
    .select("balance")
    .eq("id", network.id)
    .maybeSingle();

  if (typeof refreshed?.balance === "number" && refreshed.balance < LOW_BALANCE_THRESHOLD) {
    if (!(await hasRecentAlert(supabase, { networkId: network.id, type: "low_balance", cooldownMs: ALERT_COOLDOWN_MS }))) {
      await raiseAlert(supabase, {
        workspaceId: network.workspace_id,
        networkId: network.id,
        type: "low_balance",
        title: `[${ownerLabel}] Saldo rendah: ${network.name}`,
        message: `Saldo network ${networkTypeLabel(network.provider)} "${network.name}" (punya ${ownerLabel}) tinggal $${refreshed.balance.toFixed(2)}.`,
      });
    }
  }

  const { data: afterCampaigns } = await supabase.from("campaigns").select("id, name").eq("network_id", network.id);
  const newCampaigns = (afterCampaigns ?? []).filter((c) => !beforeIds.has(c.id));
  if (newCampaigns.length > 0) {
    await raiseAlert(supabase, {
      workspaceId: network.workspace_id,
      networkId: network.id,
      type: "new_campaign",
      title: `[${ownerLabel}] ${newCampaigns.length} campaign baru: ${network.name}`,
      message: `Campaign baru terdeteksi di ${network.name} (punya ${ownerLabel}): ${newCampaigns.map((c) => c.name).join(", ")}.`,
    });
  }

  await checkCampaignHealth(supabase, network, ownerLabel, (afterCampaigns ?? []).map((c) => c.id));

  return result;
}
