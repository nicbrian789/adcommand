import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";
import { AlertTriangle, Globe } from "lucide-react";

type Totals = { spend: number; impressions: number; clicks: number; conversions: number };

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0 });
const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString("id-ID");
const ctrOf = (t: Totals) => (t.impressions > 0 ? `${((t.clicks / t.impressions) * 100).toFixed(2)}%` : "-");

export default async function WebsitesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const { from, to } = await searchParams;
  const range = resolveDateRange(from, to);
  const supabase = await createClient();

  const { data: sites, error } = await supabase
    .from("site_stats")
    .select("campaign_id, site_key, spend, impressions, clicks, conversions")
    .gte("stat_date", range.from)
    .lte("stat_date", range.to);

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat data website</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  const campaignIds = [...new Set((sites ?? []).map((s) => s.campaign_id))];
  const { data: campaigns } = campaignIds.length
    ? await supabase.from("campaigns").select("id, network_id").in("id", campaignIds)
    : { data: [] };
  const networkIds = [...new Set((campaigns ?? []).map((c) => c.network_id))];
  const { data: networks } = networkIds.length
    ? await supabase.from("ad_networks").select("id, name").in("id", networkIds)
    : { data: [] };

  const networkOfCampaign = new Map((campaigns ?? []).map((c) => [c.id, c.network_id]));
  const networkName = new Map((networks ?? []).map((n) => [n.id, n.name]));

  const groups = new Map<string, { site: string; network: string; campaigns: Set<string>; t: Totals }>();
  for (const s of sites ?? []) {
    const network = networkName.get(networkOfCampaign.get(s.campaign_id) ?? "") ?? "-";
    const key = `${network}|${s.site_key}`;
    const g = groups.get(key) ?? { site: s.site_key, network, campaigns: new Set<string>(), t: empty() };
    g.campaigns.add(s.campaign_id);
    g.t.spend += Number(s.spend ?? 0);
    g.t.impressions += Number(s.impressions ?? 0);
    g.t.clicks += Number(s.clicks ?? 0);
    g.t.conversions += Number(s.conversions ?? 0);
    groups.set(key, g);
  }

  const rows = [...groups.values()].sort((a, b) => b.t.spend - a.t.spend);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Websites / Landing</h1>
          <p className="text-sm text-muted">
            Traffic per situs atau landing dari tiap network, {range.from} s/d {range.to}.
          </p>
        </div>
        <DateRangeFilter from={range.from} to={range.to} />
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-x-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
            <Globe size={28} className="mb-3" />
            <p className="text-sm font-medium text-foreground">Belum ada data situs di periode ini</p>
            <p className="text-xs mt-1">Klik Sync di halaman Networks untuk mengambil data per situs.</p>
          </div>
        ) : (
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-3">Situs / Landing</th>
                <th className="font-medium px-4 py-3">Network</th>
                <th className="font-medium px-4 py-3 text-right">Campaign</th>
                <th className="font-medium px-4 py-3 text-right">Spend</th>
                <th className="font-medium px-4 py-3 text-right">Impressions</th>
                <th className="font-medium px-4 py-3 text-right">Klik</th>
                <th className="font-medium px-4 py-3 text-right">CTR</th>
                <th className="font-medium px-4 py-3 text-right">Konversi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.network}|${r.site}`} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                  <td className="px-4 py-3 font-medium break-all">{r.site}</td>
                  <td className="px-4 py-3 text-muted">{r.network}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.campaigns.size}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.t.spend)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{count(r.t.impressions)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{count(r.t.clicks)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{ctrOf(r.t)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{count(r.t.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
