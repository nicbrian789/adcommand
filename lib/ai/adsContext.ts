import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addTotals,
  costPerResult,
  ctr,
  emptyTotals,
  formatCpr,
  formatMoney,
  formatPct,
  rankByExpensiveCpr,
  type MetricTotals,
  type RankedCampaign,
} from "@/lib/ai/metrics";
import { redactSecrets } from "@/lib/ai/sanitize";

const LOOKBACK_DAYS = 7;
const MAX_CAMPAIGNS_IN_CONTEXT = 25;
const MAX_ALERTS_IN_CONTEXT = 15;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AdsAssistantContext = {
  workspaceName: string;
  dateFrom: string;
  dateTo: string;
  role: "Owner" | "Member";
  summaryText: string;
};

/**
 * Build a compact, secret-free snapshot of workspace ads performance for the LLM.
 * Uses the logged-in user's Supabase client (RLS). Never loads API keys.
 */
export async function buildAdsAssistantContext(
  supabase: SupabaseClient,
  userId: string
): Promise<AdsAssistantContext> {
  const dateFrom = isoDateDaysAgo(LOOKBACK_DAYS - 1);
  const dateTo = todayIso();

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (workspaceError) throw new Error(workspaceError.message);
  if (!workspace) throw new Error("Belum ada workspace.");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", userId)
    .maybeSingle();

  const role = membership?.role === "Owner" ? "Owner" : "Member";

  let networksQuery = supabase
    .from("ad_networks")
    .select("id, name, provider, balance, last_synced_at, user_id")
    .eq("workspace_id", workspace.id);
  if (role !== "Owner") {
    networksQuery = networksQuery.eq("user_id", userId);
  }

  const [{ data: networks, error: networksError }, { data: alerts, error: alertsError }] = await Promise.all([
    networksQuery,
    supabase
      .from("alerts")
      .select("type, title, message, read, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(MAX_ALERTS_IN_CONTEXT),
  ]);

  if (networksError) throw new Error(networksError.message);
  if (alertsError) throw new Error(alertsError.message);

  const networkRows = networks ?? [];
  const networkIds = networkRows.map((n) => n.id);
  const networkMap = new Map(networkRows.map((n) => [n.id, n]));

  let campaigns: { id: string; name: string; status: string; network_id: string }[] = [];
  if (networkIds.length > 0) {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, name, status, network_id")
      .eq("workspace_id", workspace.id)
      .in("network_id", networkIds);
    if (error) throw new Error(error.message);
    campaigns = data ?? [];
  }

  const campaignIds = campaigns.map((c) => c.id);
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  let stats: {
    campaign_id: string;
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    conversions: number | null;
    revenue: number | null;
  }[] = [];

  if (campaignIds.length > 0) {
    const { data, error } = await supabase
      .from("campaign_stats")
      .select("campaign_id, spend, impressions, clicks, conversions, revenue")
      .eq("workspace_id", workspace.id)
      .eq("country", "ALL")
      .gte("stat_date", dateFrom)
      .lte("stat_date", dateTo)
      .in("campaign_id", campaignIds);
    if (error) throw new Error(error.message);
    stats = data ?? [];
  }

  const workspaceTotals = emptyTotals();
  const perCampaign = new Map<string, MetricTotals>();
  const perNetwork = new Map<string, MetricTotals>();

  for (const s of stats) {
    const campaign = campaignMap.get(s.campaign_id);
    if (!campaign) continue;
    const partial = {
      spend: s.spend ?? 0,
      impressions: s.impressions ?? 0,
      clicks: s.clicks ?? 0,
      conversions: s.conversions ?? 0,
      revenue: s.revenue ?? 0,
    };
    addTotals(workspaceTotals, partial);
    const ct = perCampaign.get(s.campaign_id) ?? emptyTotals();
    addTotals(ct, partial);
    perCampaign.set(s.campaign_id, ct);
    const nt = perNetwork.get(campaign.network_id) ?? emptyTotals();
    addTotals(nt, partial);
    perNetwork.set(campaign.network_id, nt);
  }

  const ranked: RankedCampaign[] = [...perCampaign.entries()].map(([id, t]) => {
    const c = campaignMap.get(id)!;
    const network = networkMap.get(c.network_id);
    return {
      id,
      name: c.name,
      networkName: network?.name ?? "(network)",
      status: c.status,
      spend: t.spend,
      impressions: t.impressions,
      clicks: t.clicks,
      conversions: t.conversions,
      revenue: t.revenue,
      cpr: costPerResult(t.spend, t.conversions),
      ctr: ctr(t.clicks, t.impressions),
    };
  });

  const expensive = rankByExpensiveCpr(ranked).slice(0, MAX_CAMPAIGNS_IN_CONTEXT);

  const lines: string[] = [];
  lines.push(`Workspace: ${workspace.name}`);
  lines.push(`Peran user: ${role}`);
  lines.push(`Rentang data: ${dateFrom} s/d ${dateTo} (UTC, country=ALL)`);
  lines.push("");
  lines.push("## Ringkasan workspace");
  lines.push(
    `Spend ${formatMoney(workspaceTotals.spend)} | Imp ${workspaceTotals.impressions} | Klik ${workspaceTotals.clicks} | Konversi ${workspaceTotals.conversions} | Revenue ${formatMoney(workspaceTotals.revenue)}`
  );
  lines.push(
    `CPR keseluruhan: ${formatCpr(costPerResult(workspaceTotals.spend, workspaceTotals.conversions))} | CTR: ${formatPct(ctr(workspaceTotals.clicks, workspaceTotals.impressions))}`
  );
  lines.push("");
  lines.push("## Networks");
  if (networkRows.length === 0) {
    lines.push("(tidak ada network dalam scope user)");
  } else {
    for (const n of networkRows) {
      const t = perNetwork.get(n.id) ?? emptyTotals();
      const bal = typeof n.balance === "number" ? formatMoney(n.balance) : "n/a";
      const synced = n.last_synced_at ?? "belum pernah";
      lines.push(
        `- ${n.name} [${n.provider ?? "unknown"}] saldo=${bal} last_sync=${synced} | spend=${formatMoney(t.spend)} cpr=${formatCpr(costPerResult(t.spend, t.conversions))}`
      );
    }
  }

  lines.push("");
  lines.push("## Campaign (diurutkan CPR mahal / spend tinggi)");
  if (expensive.length === 0) {
    lines.push("(belum ada statistik di rentang ini — sarankan Sync network dulu)");
  } else {
    for (const c of expensive) {
      lines.push(
        `- ${c.name} @ ${c.networkName} [${c.status}] spend=${formatMoney(c.spend)} conv=${c.conversions} cpr=${formatCpr(c.cpr)} ctr=${formatPct(c.ctr)}`
      );
    }
  }

  lines.push("");
  lines.push("## Alert terbaru");
  const alertRows = alerts ?? [];
  if (alertRows.length === 0) {
    lines.push("(tidak ada alert)");
  } else {
    for (const a of alertRows) {
      // Redact/truncate — sync failure text may echo upstream provider errors.
      const title = redactSecrets(String(a.title ?? ""), 120);
      const message = redactSecrets(String(a.message ?? ""), 180);
      lines.push(`- [${a.read ? "read" : "unread"}] ${a.type}: ${title} — ${message} (${a.created_at})`);
    }
  }

  return {
    workspaceName: workspace.name,
    dateFrom,
    dateTo,
    role,
    summaryText: lines.join("\n"),
  };
}
