import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AddCampaignForm } from "@/components/dashboard/AddCampaignForm";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";
import { Megaphone, AlertTriangle } from "lucide-react";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  network_id: string;
};

type CampaignTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

const statusStyle: Record<string, string> = {
  Running: "bg-success/15 text-success",
  Draft: "bg-muted/15 text-muted",
  Paused: "bg-warning/15 text-warning",
  Stopped: "bg-danger/15 text-danger",
};

const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString("id-ID");

async function getCampaignsData(range: { from: string; to: string }): Promise<
  | {
      workspaceId: string;
      workspaceName: string;
      networks: { id: string; name: string }[];
      campaigns: CampaignRow[];
      totals: Record<string, CampaignTotals>;
    }
  | { error: string }
> {
  const supabase = await createClient();

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workspaceError) return { error: workspaceError.message };
  if (!workspace) {
    return { workspaceId: "", workspaceName: "", networks: [], campaigns: [], totals: {} };
  }

  const [
    { data: networks, error: networksError },
    { data: campaigns, error: campaignsError },
    { data: stats, error: statsError },
  ] = await Promise.all([
    supabase.from("ad_networks").select("id, name").eq("workspace_id", workspace.id).order("name", { ascending: true }),
    supabase
      .from("campaigns")
      .select("id, name, status, created_at, network_id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_stats")
      .select("campaign_id, spend, impressions, clicks, conversions, revenue")
      .eq("workspace_id", workspace.id)
      .eq("country", "ALL")
      .gte("stat_date", range.from)
      .lte("stat_date", range.to),
  ]);

  if (networksError) return { error: networksError.message };
  if (campaignsError) return { error: campaignsError.message };
  if (statsError) return { error: statsError.message };

  const totals: Record<string, CampaignTotals> = {};
  for (const s of stats ?? []) {
    const t = (totals[s.campaign_id] ??= { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
    t.spend += Number(s.spend ?? 0);
    t.impressions += Number(s.impressions ?? 0);
    t.clicks += Number(s.clicks ?? 0);
    t.conversions += Number(s.conversions ?? 0);
    t.revenue += Number(s.revenue ?? 0);
  }

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    networks: networks ?? [],
    campaigns: campaigns ?? [],
    totals,
  };
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = resolveDateRange(from, to);
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi. Isi `.env.local` dulu untuk mengelola campaign.
      </div>
    );
  }

  const result = await getCampaignsData(range);

  if ("error" in result) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat data campaign</p>
        <p className="text-sm">{result.error}</p>
      </div>
    );
  }

  const { workspaceId, workspaceName, networks, campaigns, totals } = result;
  const networkMap = new Map(networks.map((n) => [n.id, n.name]));

  const networkSpend = new Map<string, number>();
  for (const c of campaigns) {
    networkSpend.set(c.network_id, (networkSpend.get(c.network_id) ?? 0) + (totals[c.id]?.spend ?? 0));
  }

  const campaignsByNetwork = new Map<string, CampaignRow[]>();
  for (const c of [...campaigns].sort((a, b) => (totals[b.id]?.spend ?? 0) - (totals[a.id]?.spend ?? 0))) {
    const arr = campaignsByNetwork.get(c.network_id) ?? [];
    arr.push(c);
    campaignsByNetwork.set(c.network_id, arr);
  }

  const networkGroups = [...campaignsByNetwork.entries()]
    .map(([networkId, rows]) => ({
      networkId,
      networkName: networkMap.get(networkId) ?? "-",
      spend: networkSpend.get(networkId) ?? 0,
      rows,
    }))
    .sort((a, b) => b.spend - a.spend);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Campaigns</h1>
          <p className="text-sm text-muted">
            Daftar campaign workspace {workspaceName ? `"${workspaceName}"` : ""}. Statistik {range.from} s/d {range.to}.
          </p>
          <div className="mt-3">
            <DateRangeFilter from={range.from} to={range.to} />
          </div>
        </div>
        {workspaceId && networks.length > 0 ? (
          <AddCampaignForm workspaceId={workspaceId} networks={networks} />
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-x-auto">
        {networks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
            <Megaphone size={28} className="mb-3" />
            <p className="text-sm font-medium text-foreground">Belum ada ad network</p>
            <p className="text-xs mt-1">
              Campaign harus terhubung ke ad network. Tambahkan network dulu di{" "}
              <Link href="/dashboard/networks" className="text-accent">
                halaman Networks
              </Link>
              .
            </p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
            <Megaphone size={28} className="mb-3" />
            <p className="text-sm font-medium text-foreground">Belum ada campaign</p>
            <p className="text-xs mt-1">Tambahkan campaign pertama kamu lewat tombol di atas, atau sinkronkan network.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-3">Nama</th>
                <th className="font-medium px-4 py-3">Status</th>
                <th className="font-medium px-4 py-3 text-right">Spend</th>
                <th className="font-medium px-4 py-3 text-right">Impressions</th>
                <th className="font-medium px-4 py-3 text-right">Klik</th>
                <th className="font-medium px-4 py-3 text-right">CTR</th>
                <th className="font-medium px-4 py-3 text-right">Konversi</th>
                <th className="font-medium px-4 py-3 text-right">Revenue</th>
                <th className="font-medium px-4 py-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {networkGroups.map((group) => (
                <Fragment key={group.networkId}>
                  <tr className="border-b border-border bg-surface-2/60">
                    <td colSpan={9} className="px-4 py-2 text-xs font-semibold">
                      <span className="rounded-full bg-accent/15 text-accent px-2.5 py-0.5">{group.networkName}</span>
                      <span className="ml-2 text-muted font-normal">{money(group.spend)} total spend</span>
                    </td>
                  </tr>
                  {group.rows.map((c) => {
                    const t = totals[c.id];
                    const ctr = t && t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
                    const roas = t && t.spend > 0 ? t.revenue / t.spend : null;
                    return (
                      <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                        <td className="px-4 py-3 pl-6">{c.name}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[c.status] ?? "bg-muted/15 text-muted"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{t ? money(t.spend) : "-"}</td>
                        <td className="px-4 py-3 text-right">{t ? count(t.impressions) : "-"}</td>
                        <td className="px-4 py-3 text-right">{t ? count(t.clicks) : "-"}</td>
                        <td className="px-4 py-3 text-right">{ctr !== null ? `${ctr.toFixed(2)}%` : "-"}</td>
                        <td className="px-4 py-3 text-right">{t ? count(t.conversions) : "-"}</td>
                        <td className="px-4 py-3 text-right">{t ? money(t.revenue) : "-"}</td>
                        <td className="px-4 py-3 text-right">{roas !== null ? `${roas.toFixed(2)}x` : "-"}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted">
        Konversi dan revenue dari TrafficStars masih 0, karena konversi asli baru bisa dicatat lewat tracker atau postback dari offer.
      </p>
    </div>
  );
}
