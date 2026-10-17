import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { MemberFilterTabs } from "@/components/dashboard/MemberFilterTabs";
import { resolveDateRange } from "@/lib/dateRange";
import { colorForNetwork } from "@/lib/networkColors";
import { AlertTriangle, BarChart3 } from "lucide-react";

type Totals = { spend: number; impressions: number; clicks: number };

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0 });
const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString("id-ID");
const ctrOf = (t: Totals) => (t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0);
const cpcOf = (t: Totals) => (t.clicks > 0 ? t.spend / t.clicks : 0);

function add(t: Totals, s: { spend: number | null; impressions: number | null; clicks: number | null }) {
  t.spend += Number(s.spend ?? 0);
  t.impressions += Number(s.impressions ?? 0);
  t.clicks += Number(s.clicks ?? 0);
}

function BarChart({ data, format }: { data: { label: string; value: number }[]; format: (n: number) => string }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Belum ada data di periode ini.</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = 600 / data.length;
  const barW = Math.max(slot * 0.6, 2);
  const chartH = 150;

  return (
    <div className="space-y-2">
      <svg viewBox="0 0 600 180" className="w-full h-48 text-accent" preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const h = (d.value / max) * chartH;
          const x = i * slot + (slot - barW) / 2;
          return (
            <g key={d.label}>
              <rect x={x} y={chartH - h} width={barW} height={Math.max(h, 0.5)} fill="currentColor" opacity={0.85} rx={1.5}>
                <title>{`${d.label}: ${format(d.value)}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1="0" x2="600" y1={chartH} y2={chartH} stroke="currentColor" strokeOpacity="0.2" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted tabular-nums">
        <span>{data[0].label}</span>
        <span>{data[Math.floor(data.length / 2)].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
      <p className="text-xs text-muted">Nilai tertinggi: {format(max)}</p>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; network?: string; member?: string }>;
}) {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const { from, to, network, member } = await searchParams;
  const range = resolveDateRange(from, to);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Sesi kamu sudah habis. Silakan masuk lagi.</div>;
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (workspaceError) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat analytics</p>
        <p className="text-sm">{workspaceError.message}</p>
      </div>
    );
  }
  if (!workspace) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Belum ada workspace.</div>;
  }

  const [
    { data: myMembership },
    { data: workspaceMembers },
    { data: networks, error: networksError },
    { data: campaigns },
  ] = await Promise.all([
    supabase.from("workspace_members").select("role").eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("user_id").eq("workspace_id", workspace.id),
    supabase
      .from("ad_networks")
      .select("id, name, user_id, provider")
      .eq("workspace_id", workspace.id)
      .order("name", { ascending: true }),
    supabase.from("campaigns").select("id, name, network_id").eq("workspace_id", workspace.id),
  ]);
  if (networksError) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat analytics</p>
        <p className="text-sm">{networksError.message}</p>
      </div>
    );
  }

  const isOwner = myMembership?.role === "Owner";
  const memberIds = (workspaceMembers ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = profileMap.get(id);
    return p?.full_name || p?.email || "(tanpa nama)";
  };
  const selectedMember = isOwner && member && member !== "all" && memberIds.includes(member) ? member : !isOwner ? user.id : null;

  const allNetworks = networks ?? [];
  const memberFilteredNetworks = selectedMember ? allNetworks.filter((n) => n.user_id === selectedMember) : allNetworks;

  const networkName = new Map(memberFilteredNetworks.map((n) => [n.id, n.name]));
  const networkProvider = new Map(memberFilteredNetworks.map((n) => [n.id, n.provider as string | null]));
  const selectedNetwork = network && networkName.has(network) ? network : null;
  const memberFilteredNetworkIds = new Set(memberFilteredNetworks.map((n) => n.id));
  const visibleCampaigns = (campaigns ?? []).filter(
    (c) => memberFilteredNetworkIds.has(c.network_id) && (!selectedNetwork || c.network_id === selectedNetwork)
  );
  const campaignIds = visibleCampaigns.map((c) => c.id);

  const networkOwner = new Map(allNetworks.map((n) => [n.id, n.user_id]));
  const campaignCountByOwner = new Map<string, number>();
  for (const c of campaigns ?? []) {
    const owner = networkOwner.get(c.network_id);
    if (!owner) continue;
    campaignCountByOwner.set(owner, (campaignCountByOwner.get(owner) ?? 0) + 1);
  }
  const members = memberIds.map((id) => ({ id, label: nameOf(id), count: campaignCountByOwner.get(id) ?? 0 }));

  const { data: stats } = campaignIds.length
    ? await supabase
        .from("campaign_stats")
        .select("campaign_id, stat_date, spend, impressions, clicks")
        .eq("country", "ALL")
        .in("campaign_id", campaignIds)
        .gte("stat_date", range.from)
        .lte("stat_date", range.to)
    : { data: [] };

  const campaignById = new Map(visibleCampaigns.map((c) => [c.id, c]));
  const total = empty();
  const perDay = new Map<string, Totals>();
  const perNetwork = new Map<string, Totals>();
  const perCampaign = new Map<string, Totals>();

  for (const s of stats ?? []) {
    add(total, s);

    const d = perDay.get(s.stat_date) ?? empty();
    add(d, s);
    perDay.set(s.stat_date, d);

    const c = campaignById.get(s.campaign_id);
    if (c) {
      const n = perNetwork.get(c.network_id) ?? empty();
      add(n, s);
      perNetwork.set(c.network_id, n);
    }

    const pc = perCampaign.get(s.campaign_id) ?? empty();
    add(pc, s);
    perCampaign.set(s.campaign_id, pc);
  }

  const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const spendSeries = days.map(([day, t]) => ({ label: day.slice(5), value: t.spend }));
  const clickSeries = days.map(([day, t]) => ({ label: day.slice(5), value: t.clicks }));

  const networkRows = [...perNetwork.entries()]
    .map(([id, t]) => ({
      id,
      name: networkName.get(id) ?? "-",
      color: colorForNetwork(networkName.get(id) ?? "-", networkProvider.get(id) ?? null),
      t,
    }))
    .sort((a, b) => b.t.spend - a.t.spend);
  const maxNetworkSpend = Math.max(...networkRows.map((n) => n.t.spend), 1);

  const overallCtr = ctrOf(total);
  const campaignsAvgSpend =
    perCampaign.size > 0 ? [...perCampaign.values()].reduce((s, t) => s + t.spend, 0) / perCampaign.size : 0;

  const flagged = [...perCampaign.entries()]
    .map(([id, t]) => ({ id, name: campaignById.get(id)?.name ?? "-", network: networkName.get(campaignById.get(id)?.network_id ?? "") ?? "-", t }))
    .filter((c) => c.t.spend >= campaignsAvgSpend && c.t.spend > 0 && ctrOf(c.t) < overallCtr)
    .sort((a, b) => b.t.spend - a.t.spend)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-lg font-semibold">Analytics</h1>
            <p className="text-sm text-muted">Tren dan perbandingan performa, {range.from} s/d {range.to}.</p>
          </div>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="from" value={range.from} />
            <input type="hidden" name="to" value={range.to} />
            {selectedMember ? <input type="hidden" name="member" value={selectedMember} /> : null}
            <select
              name="network"
              defaultValue={selectedNetwork ?? "all"}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="all">Semua network</option>
              {memberFilteredNetworks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90">
              Tampilkan
            </button>
          </form>
        </div>
        <DateRangeFilter from={range.from} to={range.to} />
        {isOwner ? <MemberFilterTabs members={members} selected={selectedMember} /> : null}
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Spend", value: money(total.spend), isMoney: true },
          { label: "Klik", value: count(total.clicks), isMoney: false },
          { label: "CTR", value: `${overallCtr.toFixed(2)}%`, isMoney: false },
          { label: "CPC", value: `$${cpcOf(total).toFixed(4)}`, isMoney: true },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-1">{k.label}</div>
            <div className={`text-lg font-semibold tabular-nums ${k.isMoney ? "text-success" : ""}`}>{k.value}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold mb-3">Spend per hari</div>
          <BarChart data={spendSeries} format={money} />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="text-sm font-semibold mb-3">Klik per hari</div>
          <BarChart data={clickSeries} format={count} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Perbandingan network</div>
        {networkRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Belum ada data network di periode ini.</p>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-2">Network</th>
                <th className="font-medium px-4 py-2">Porsi spend</th>
                <th className="font-medium px-4 py-2 text-right">Spend</th>
                <th className="font-medium px-4 py-2 text-right">Klik</th>
                <th className="font-medium px-4 py-2 text-right">CTR</th>
                <th className="font-medium px-4 py-2 text-right">CPC</th>
              </tr>
            </thead>
            <tbody>
              {networkRows.map((n) => (
                <tr key={n.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: n.color }} />
                      {n.name}
                    </span>
                  </td>
                  <td className="px-4 py-2 w-48">
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(n.t.spend / maxNetworkSpend) * 100}%`, backgroundColor: n.color }} />
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-success">{money(n.t.spend)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{count(n.t.clicks)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{ctrOf(n.t).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-success">${cpcOf(n.t).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Tren harian: CTR dan CPC</div>
        {days.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Belum ada data di periode ini.</p>
        ) : (
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-2">Tanggal</th>
                <th className="font-medium px-4 py-2 text-right">Spend</th>
                <th className="font-medium px-4 py-2 text-right">Klik</th>
                <th className="font-medium px-4 py-2 text-right">CTR</th>
                <th className="font-medium px-4 py-2 text-right">CPC</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map(([day, t]) => (
                <tr key={day} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">{day}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-success">{money(t.spend)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{count(t.clicks)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{ctrOf(t).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-success">${cpcOf(t).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-x-auto">
        <div className="px-4 py-3 border-b border-border">
          <div className="text-sm font-semibold">Campaign yang perlu dicek</div>
          <p className="text-xs text-muted">Spend di atas rata-rata, tapi CTR di bawah rata-rata semua campaign ({overallCtr.toFixed(2)}%).</p>
        </div>
        {flagged.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">Tidak ada campaign yang perlu dicek di periode ini.</p>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-2">Campaign</th>
                <th className="font-medium px-4 py-2">Network</th>
                <th className="font-medium px-4 py-2 text-right">Spend</th>
                <th className="font-medium px-4 py-2 text-right">Klik</th>
                <th className="font-medium px-4 py-2 text-right">CTR</th>
                <th className="font-medium px-4 py-2 text-right">CPC</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-muted">{c.network}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(c.t.spend)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{count(c.t.clicks)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-danger">{ctrOf(c.t).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right tabular-nums">${cpcOf(c.t).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted">
        <BarChart3 size={12} />
        Konversi dan ROAS belum dimasukkan di halaman ini, karena datanya belum akurat sampai tracker dibuat.
      </p>
    </div>
  );
}
