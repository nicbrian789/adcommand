import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";
import { networkTypeLabel } from "@/lib/networks";

type Totals = { spend: number; impressions: number; clicks: number; conversions: number; revenue: number };

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });
const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString("id-ID");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(2)}%` : "-");

function add(t: Totals, s: Partial<Record<keyof Totals, number | null>>) {
  t.spend += Number(s.spend ?? 0);
  t.impressions += Number(s.impressions ?? 0);
  t.clicks += Number(s.clicks ?? 0);
  t.conversions += Number(s.conversions ?? 0);
  t.revenue += Number(s.revenue ?? 0);
}

export default async function NetworkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const { id } = await params;
  const { from, to } = await searchParams;
  const range = resolveDateRange(from, to);
  const supabase = await createClient();

  const [{ data: network }, { data: campaigns }] = await Promise.all([
    supabase
      .from("ad_networks")
      .select("id, name, provider, enabled, balance, balance_checked_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("campaigns").select("id, name, status").eq("network_id", id),
  ]);

  if (!network) notFound();

  const campaignIds = (campaigns ?? []).map((c) => c.id);

  const { data: stats } = campaignIds.length
    ? await supabase
        .from("campaign_stats")
        .select("campaign_id, stat_date, country, spend, impressions, clicks, conversions, revenue")
        .in("campaign_id", campaignIds)
        .gte("stat_date", range.from)
        .lte("stat_date", range.to)
    : { data: [] };

  const total = empty();
  const perCampaign = new Map<string, Totals>();
  const perDay = new Map<string, Totals>();
  const perCountry = new Map<string, Totals>();

  for (const s of stats ?? []) {
    if (s.country === "ALL") {
      add(total, s);

      const pc = perCampaign.get(s.campaign_id) ?? empty();
      add(pc, s);
      perCampaign.set(s.campaign_id, pc);

      const pd = perDay.get(s.stat_date) ?? empty();
      add(pd, s);
      perDay.set(s.stat_date, pd);
    } else {
      const pn = perCountry.get(s.country) ?? empty();
      add(pn, s);
      perCountry.set(s.country, pn);
    }
  }

  const campaignRows = (campaigns ?? [])
    .map((c) => ({ id: c.id, name: c.name, status: c.status, t: perCampaign.get(c.id) ?? null }))
    .sort((a, b) => (b.t?.spend ?? 0) - (a.t?.spend ?? 0));

  const dayRows = [...perDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const countryRows = [...perCountry.entries()].sort((a, b) => b[1].spend - a[1].spend);

  const kpis = [
    { label: "Spend", value: money(total.spend) },
    { label: "Impressions", value: count(total.impressions) },
    { label: "Klik", value: count(total.clicks) },
    { label: "CTR", value: pct(total.clicks, total.impressions) },
    { label: "CPC", value: total.clicks > 0 ? `$${(total.spend / total.clicks).toFixed(4)}` : "-" },
    { label: "Konversi", value: count(total.conversions) },
    { label: "Revenue", value: money(total.revenue) },
    { label: "ROAS", value: total.spend > 0 ? `${(total.revenue / total.spend).toFixed(2)}x` : "-" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/dashboard/networks" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft size={14} />
          Kembali ke Networks
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-lg font-semibold">{network.name}</h1>
            <p className="text-sm text-muted">
              {networkTypeLabel(network.provider)} · {network.enabled ? "Aktif" : "Nonaktif"} · {campaignRows.length} campaign
              {network.balance !== null ? ` · Sisa saldo ${money(Number(network.balance))}` : ""}
            </p>
          </div>
          <DateRangeFilter from={range.from} to={range.to} />
        </div>
        <p className="text-xs text-muted">Periode {range.from} s/d {range.to}</p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">{k.label}</div>
            <div className="text-lg font-semibold tabular-nums">{k.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Semua campaign</div>
        {campaignRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Belum ada campaign di network ini. Sync network dulu dari halaman Networks.</p>
        ) : (
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-2">Campaign</th>
                <th className="font-medium px-4 py-2">Status</th>
                <th className="font-medium px-4 py-2 text-right">Spend</th>
                <th className="font-medium px-4 py-2 text-right">Impressions</th>
                <th className="font-medium px-4 py-2 text-right">Klik</th>
                <th className="font-medium px-4 py-2 text-right">CTR</th>
                <th className="font-medium px-4 py-2 text-right">CPC</th>
                <th className="font-medium px-4 py-2 text-right">Konversi</th>
                <th className="font-medium px-4 py-2 text-right">Revenue</th>
                <th className="font-medium px-4 py-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {campaignRows.map((c) => {
                const t = c.t ?? empty();
                return (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-muted">{c.status}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(t.spend)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.impressions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.clicks)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{pct(t.clicks, t.impressions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.clicks > 0 ? `$${(t.spend / t.clicks).toFixed(4)}` : "-"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.conversions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(t.revenue)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.spend > 0 ? `${(t.revenue / t.spend).toFixed(2)}x` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="rounded-xl border border-border bg-surface overflow-x-auto">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">Per hari</div>
          {dayRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">Belum ada data di periode ini.</p>
          ) : (
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                  <th className="font-medium px-4 py-2">Tanggal</th>
                  <th className="font-medium px-4 py-2 text-right">Spend</th>
                  <th className="font-medium px-4 py-2 text-right">Klik</th>
                  <th className="font-medium px-4 py-2 text-right">CTR</th>
                  <th className="font-medium px-4 py-2 text-right">Konversi</th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map(([day, t]) => (
                  <tr key={day} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">{day}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(t.spend)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.clicks)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{pct(t.clicks, t.impressions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface overflow-x-auto">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold">Per negara</div>
          {countryRows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">Belum ada data negara di periode ini.</p>
          ) : (
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                  <th className="font-medium px-4 py-2">Negara</th>
                  <th className="font-medium px-4 py-2 text-right">Spend</th>
                  <th className="font-medium px-4 py-2 text-right">Klik</th>
                  <th className="font-medium px-4 py-2 text-right">CTR</th>
                  <th className="font-medium px-4 py-2 text-right">Konversi</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map(([code, t]) => (
                  <tr key={code} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium">{code}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(t.spend)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.clicks)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{pct(t.clicks, t.impressions)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(t.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
