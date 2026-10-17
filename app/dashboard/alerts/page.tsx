import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { MarkAllReadButton } from "@/components/dashboard/MarkAllReadButton";
import { MarkReadButton } from "@/components/dashboard/MarkReadButton";
import { AutoMarkAlertsRead } from "@/components/dashboard/AutoMarkAlertsRead";
import { AlertTriangle, Bell, Wallet, TrendingDown, CircleSlash, Sparkles, Clock } from "lucide-react";

type AlertRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

const iconFor: Record<string, typeof Bell> = {
  sync_failed: AlertTriangle,
  low_balance: Wallet,
  ctr_drop: TrendingDown,
  no_activity: CircleSlash,
  new_campaign: Sparkles,
  stale_sync: Clock,
};

const colorFor: Record<string, string> = {
  sync_failed: "bg-danger/15 text-danger",
  low_balance: "bg-warning/15 text-warning",
  ctr_drop: "bg-danger/15 text-danger",
  no_activity: "bg-warning/15 text-warning",
  new_campaign: "bg-success/15 text-success",
  stale_sync: "bg-warning/15 text-warning",
};

export default async function AlertsPage() {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!workspace) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Belum ada workspace.</div>;
  }

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("id, type, title, message, read, created_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat alerts</p>
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }

  const rows: AlertRow[] = alerts ?? [];
  const unreadCount = rows.filter((r) => !r.read).length;

  const unreadIds = rows.filter((r) => !r.read).map((r) => r.id);

  return (
    <div className="space-y-5">
      <AutoMarkAlertsRead alertIds={unreadIds} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Alerts</h1>
          <p className="text-sm text-muted">
            Notifikasi otomatis saat sync gagal atau saldo network menipis. Dikirim juga ke grup Telegram tim.
          </p>
        </div>
        {unreadCount > 0 ? <MarkAllReadButton workspaceId={workspace.id} /> : null}
      </div>

      <div className="rounded-xl border border-border bg-surface divide-y divide-border/60">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
            <Bell size={28} className="mb-3" />
            <p className="text-sm font-medium text-foreground">Belum ada alert</p>
            <p className="text-xs mt-1">Alert otomatis muncul kalau ada sync gagal atau saldo network menipis.</p>
          </div>
        ) : (
          rows.map((a) => {
            const Icon = iconFor[a.type] ?? Bell;
            return (
              <div key={a.id} className={`flex items-start gap-3 px-4 py-3 ${a.read ? "" : "bg-accent/5"}`}>
                <div
                  className={`mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${
                    colorFor[a.type] ?? "bg-warning/15 text-warning"
                  }`}
                >
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{a.title}</p>
                    {!a.read ? <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" /> : null}
                  </div>
                  <p className="text-sm text-muted mt-0.5">{a.message}</p>
                  <p className="text-xs text-muted mt-1">
                    {new Date(a.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {!a.read ? <MarkReadButton alertId={a.id} /> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
