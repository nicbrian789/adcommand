import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { resolveDateRange } from "@/lib/dateRange";
import { FileText, Download } from "lucide-react";

export default async function ReportsPage({
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-sm text-muted">
          Export data campaign workspace {workspace?.name ? `"${workspace.name}"` : ""} ke file CSV (bisa dibuka di Excel/Sheets).{" "}
          {isOwner
            ? "Sebagai Owner, laporan ini berisi campaign semua anggota tim (ada kolom Pemilik)."
            : "Laporan ini cuma berisi campaign dari network yang kamu kelola sendiri."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div>
          <p className="text-sm font-medium mb-2">Rentang tanggal</p>
          <DateRangeFilter from={range.from} to={range.to} />
        </div>

        <div className="flex items-start gap-4 rounded-lg border border-border bg-surface-2/60 p-4">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
            <FileText size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Laporan Campaign</p>
            <p className="text-xs text-muted mt-0.5">
              {isOwner ? "Campaign semua anggota tim" : "Campaign kamu sendiri"} (dikelompokkan per network): spend, impressions, klik, CTR, konversi, revenue, dan ROAS untuk {range.from} s/d {range.to}.
            </p>
          </div>
          <a
            href={`/api/reports/campaigns?from=${range.from}&to=${range.to}`}
            className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-3 py-1.5 hover:bg-accent/90 shrink-0"
          >
            <Download size={14} />
            Download CSV
          </a>
        </div>
      </div>
    </div>
  );
}
