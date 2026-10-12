import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";
import { FileText, Download, History } from "lucide-react";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; member?: string }>;
}) {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const { from, to, member } = await searchParams;
  const range = resolveDateRange(from, to);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: myMembership } = user && workspace
    ? await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const isOwner = myMembership?.role === "Owner";

  const [{ data: workspaceMembers }, { data: exports }] = await Promise.all([
    isOwner && workspace
      ? supabase.from("workspace_members").select("user_id").eq("workspace_id", workspace.id)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    workspace
      ? supabase
          .from("report_exports")
          .select("id, user_id, date_from, date_to, member_filter, created_at")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const profileIds = [
    ...new Set([
      ...(workspaceMembers ?? []).map((m) => m.user_id),
      ...(exports ?? []).map((e) => e.user_id),
      ...(exports ?? []).map((e) => e.member_filter).filter((id): id is string => !!id),
    ]),
  ];
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", profileIds)
    : { data: [] };
  const nameOf = (id: string) => {
    const p = (profiles ?? []).find((p) => p.id === id);
    return p?.full_name || p?.email || "(tanpa nama)";
  };

  const selectedMember = isOwner && member && (workspaceMembers ?? []).some((m) => m.user_id === member) ? member : null;

  const downloadHref = `/api/reports/campaigns?from=${range.from}&to=${range.to}${selectedMember ? `&member=${selectedMember}` : ""}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-sm text-muted">
          Export data campaign workspace {workspace?.name ? `"${workspace.name}"` : ""} ke file CSV (bisa dibuka di Excel/Sheets).{" "}
          {isOwner
            ? "Sebagai Owner, laporan ini berisi campaign semua anggota tim (ada kolom Pemilik), atau bisa difilter per anggota."
            : "Laporan ini cuma berisi campaign dari network yang kamu kelola sendiri."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-sm font-medium mb-2">Rentang tanggal</p>
            <DateRangeFilter from={range.from} to={range.to} />
          </div>

          {isOwner ? (
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="from" value={range.from} />
              <input type="hidden" name="to" value={range.to} />
              <div>
                <p className="text-sm font-medium mb-2">Anggota</p>
                <select
                  name="member"
                  defaultValue={selectedMember ?? "all"}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="all">Semua anggota</option>
                  {(workspaceMembers ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {nameOf(m.user_id)}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90">
                Tampilkan
              </button>
            </form>
          ) : null}
        </div>

        <div className="flex items-start gap-4 rounded-lg border border-border bg-surface-2/60 p-4">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
            <FileText size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Laporan Campaign</p>
            <p className="text-xs text-muted mt-0.5">
              {isOwner
                ? selectedMember
                  ? `Campaign milik ${nameOf(selectedMember)}`
                  : "Campaign semua anggota tim"
                : "Campaign kamu sendiri"}{" "}
              (dikelompokkan per network): spend, impressions, klik, CTR, konversi, revenue, dan ROAS untuk {range.from} s/d {range.to}.
            </p>
          </div>
          <a
            href={downloadHref}
            className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-3 py-1.5 hover:bg-accent/90 shrink-0"
          >
            <Download size={14} />
            Download CSV
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <History size={14} />
          Riwayat download
        </div>
        {(exports ?? []).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Belum ada yang download laporan.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {(exports ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {isOwner ? <span className="font-medium">{nameOf(e.user_id)}</span> : "Kamu"} download{" "}
                    {e.member_filter ? `campaign ${nameOf(e.member_filter)}` : isOwner ? "semua anggota" : "campaign-mu"}{" "}
                    <span className="text-muted">({e.date_from} s/d {e.date_to})</span>
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(e.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <a
                  href={`/api/reports/campaigns?from=${e.date_from}&to=${e.date_to}${e.member_filter ? `&member=${e.member_filter}` : ""}`}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
                >
                  Download lagi
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
