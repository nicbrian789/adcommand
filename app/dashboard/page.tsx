import Link from "next/link";
import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Share2 } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";

type Totals = { spend: number; impressions: number; clicks: number; conversions: number; revenue: number };

const emptyTotals = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

const money = (n: number) => `$${n.toFixed(2)}`;
const count = (n: number) => n.toLocaleString("id-ID");

function add(t: Totals, s: Partial<Totals>) {
  t.spend += Number(s.spend ?? 0);
  t.impressions += Number(s.impressions ?? 0);
  t.clicks += Number(s.clicks ?? 0);
  t.conversions += Number(s.conversions ?? 0);
  t.revenue += Number(s.revenue ?? 0);
}

async function getOverview(memberParam: string | undefined, range: { from: string; to: string }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi kamu sudah habis. Silakan masuk lagi." };

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (workspaceError) return { error: workspaceError.message };
  if (!workspace) return { empty: true as const };

  const { data: myMembership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isOwner = myMembership?.role === "Owner";

  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspace.id);
  if (membersError) return { error: membersError.message };

  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = profileMap.get(id);
    return p?.full_name || p?.email || "(tanpa nama)";
  };

  const selectedMember = isOwner && memberParam && memberParam !== "all" && memberIds.includes(memberParam)
    ? memberParam
    : null;

  const { data: networks, error: networksError } = await supabase
    .from("ad_networks")
    .select("id, name, user_id, balance, balance_checked_at")
    .eq("workspace_id", workspace.id);
  if (networksError) return { error: networksError.message };

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, name, network_id")
    .eq("workspace_id", workspace.id);
  if (campaignsError) return { error: campaignsError.message };

  const { data: stats, error: statsError } = await supabase
    .from("campaign_stats")
    .select("campaign_id, spend, impressions, clicks, conversions, revenue")
    .eq("workspace_id", workspace.id)
    .eq("country", "ALL")
    .gte("stat_date", range.from)
    .lte("stat_date", range.to);
  if (statsError) return { error: statsError.message };

  const networkMap = new Map((networks ?? []).map((n) => [n.id, n]));

  const campaignVisible = (campaignId: string) => {
    const c = (campaigns ?? []).find((x) => x.id === campaignId);
    if (!c) return false;
    if (!selectedMember) return true;
    return networkMap.get(c.network_id)?.user_id === selectedMember;
  };

  const total = emptyTotals();
  const perCampaign = new Map<string, Totals>();
  const perNetwork = new Map<string, Totals>();

  for (const s of stats ?? []) {
    if (!campaignVisible(s.campaign_id)) continue;
    add(total, s);

    const pc = perCampaign.get(s.campaign_id) ?? emptyTotals();
    add(pc, s);
    perCampaign.set(s.campaign_id, pc);

    const campaign = (campaigns ?? []).find((c) => c.id === s.campaign_id);
    if (campaign) {
      const pn = perNetwork.get(campaign.network_id) ?? emptyTotals();
      add(pn, s);
      perNetwork.set(campaign.network_id, pn);
    }
  }

  const networkRows = (networks ?? [])
    .filter((n) => perNetwork.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      owner: nameOf(n.user_id),
      balance: n.balance as number | null,
      t: perNetwork.get(n.id)!,
    }))
    .sort((a, b) => b.t.spend - a.t.spend);

  const campaignRowsRaw = (campaigns ?? [])
    .filter((c) => perCampaign.has(c.id))
    .map((c) => {
      const net = networkMap.get(c.network_id);
      return {
        id: c.id,
        name: c.name,
        networkId: c.network_id,
        network: net?.name ?? "-",
        owner: net ? nameOf(net.user_id) : "-",
        t: perCampaign.get(c.id)!,
      };
    })
    .sort((a, b) => b.t.spend - a.t.spend);

  const campaignsByNetwork = new Map<string, typeof campaignRowsRaw>();
  for (const row of campaignRowsRaw) {
    const arr = campaignsByNetwork.get(row.networkId) ?? [];
    arr.push(row);
    campaignsByNetwork.set(row.networkId, arr);
  }

  const campaignGroups = networkRows.map((n) => ({
    networkId: n.id,
    networkName: n.name,
    owner: n.owner,
    rows: (campaignsByNetwork.get(n.id) ?? []).slice(0, 5),
  }));

  return {
    isOwner,
    workspaceName: workspace.name,
    selectedMember,
    members: (members ?? []).map((m) => ({ id: m.user_id, label: nameOf(m.user_id) })),
    total,
    networkRows,
    campaignGroups,
    hasData: (stats ?? []).length > 0,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; from?: string; to?: string }>;
}) {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi. Isi `.env.local` dulu untuk melihat dashboard.
      </div>
    );
  }

  const { member, from, to } = await searchParams;
  const range = resolveDateRange(from, to);
  const result = await getOverview(member, range);

  if ("error" in result) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger">
        <p className="font-medium">Gagal memuat dashboard</p>
        <p className="text-sm mt-1">{result.error}</p>
      </div>
    );
  }

  if ("empty" in result) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Belum ada workspace. Daftar akun pertama untuk membuatnya.
      </div>
    );
  }

  const { isOwner, workspaceName, selectedMember, members, total, networkRows, campaignGroups, hasData } = result;

  const ctr = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : 0;
  const cpc = total.clicks > 0 ? total.spend / total.clicks : 0;
  const roas = total.spend > 0 ? total.revenue / total.spend : 0;

  const kpis = [
    { label: "Spend", value: money(total.spend) },
    { label: "Impressions", value: count(total.impressions) },
    { label: "Klik", value: count(total.clicks) },
    { label: "CTR", value: `${ctr.toFixed(2)}%` },
    { label: "CPC", value: `$${cpc.toFixed(4)}` },
    { label: "Konversi", value: count(total.conversions) },
    { label: "Revenue", value: money(total.revenue) },
    { label: "ROAS", value: `${roas.toFixed(2)}x` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-sm text-muted">
            {workspaceName ? `Workspace "${workspaceName}" · ` : ""}{range.from} s/d {range.to}
            {selectedMember
              ? ` · ${members.find((m) => m.id === selectedMember)?.label ?? ""}`
              : isOwner
                ? " · semua anggota"
                : ""}
          </p>
          <div className="mt-3">
            <DateRangeFilter from={range.from} to={range.to} />
          </div>
        </div>

        {isOwner ? (
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="from" value={range.from} />
            <input type="hidden" name="to" value={range.to} />
            <select
              name="member"
              defaultValue={selectedMember ?? "all"}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="all">Semua anggota</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90">
              Tampilkan
            </button>
          </form>
        ) : null}
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
          <Share2 size={28} className="mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">Belum ada data statistik</p>
          <p className="text-xs mt-1">
            Buka{" "}
            <Link href="/dashboard/networks" className="text-accent">
              halaman Networks
            </Link>{" "}
            lalu klik Sync di network yang sudah terhubung.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted mb-1">{k.label}</div>
                <div className="text-lg font-semibold tabular-nums">{k.value}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="rounded-xl border border-border bg-surface overflow-x-auto">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold">Per network</div>
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                    <th className="font-medium px-4 py-2">Network</th>
                    {isOwner ? <th className="font-medium px-4 py-2">Pemilik</th> : null}
                    <th className="font-medium px-4 py-2 text-right">Spend</th>
                    <th className="font-medium px-4 py-2 text-right">Klik</th>
                    <th className="font-medium px-4 py-2 text-right">Revenue</th>
                    <th className="font-medium px-4 py-2 text-right">Sisa saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {networkRows.map((n) => (
                    <tr key={n.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium">{n.name}</td>
                      {isOwner ? <td className="px-4 py-2 text-muted">{n.owner}</td> : null}
                      <td className="px-4 py-2 text-right tabular-nums">{money(n.t.spend)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{count(n.t.clicks)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(n.t.revenue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {n.balance !== null ? money(n.balance) : <span className="text-muted">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-x-auto">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold">Campaign teratas per network</div>
              {campaignGroups.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">Belum ada campaign dengan data di periode ini.</p>
              ) : (
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                      <th className="font-medium px-4 py-2">Campaign</th>
                      <th className="font-medium px-4 py-2 text-right">Spend</th>
                      <th className="font-medium px-4 py-2 text-right">Impressions</th>
                      <th className="font-medium px-4 py-2 text-right">Klik</th>
                      <th className="font-medium px-4 py-2 text-right">CTR</th>
                      <th className="font-medium px-4 py-2 text-right">Konversi</th>
                      <th className="font-medium px-4 py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignGroups.map((group) => (
                      <Fragment key={group.networkId}>
                        <tr className="border-b border-border bg-surface-2/60">
                          <td colSpan={7} className="px-4 py-2 text-xs font-semibold">
                            <span className="rounded-full bg-accent/15 text-accent px-2.5 py-0.5">{group.networkName}</span>
                            {isOwner ? <span className="ml-2 text-muted font-normal">{group.owner}</span> : null}
                          </td>
                        </tr>
                        {group.rows.map((c) => {
                          const cCtr = c.t.impressions > 0 ? (c.t.clicks / c.t.impressions) * 100 : 0;
                          return (
                            <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/60">
                              <td className="px-4 py-2 pl-6">{c.name}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{money(c.t.spend)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{count(c.t.impressions)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{count(c.t.clicks)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{cCtr.toFixed(2)}%</td>
                              <td className="px-4 py-2 text-right tabular-nums">{count(c.t.conversions)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{money(c.t.revenue)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <p className="text-xs text-muted">
            Konversi dan revenue masih 0 untuk TrafficStars. Konversi asli butuh tracker atau postback dari offer.
          </p>
        </>
      )}
    </div>
  );
}
