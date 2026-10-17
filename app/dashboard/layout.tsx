import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let networks: { id: string; name: string; synced: boolean }[] = [];
  let unreadAlerts = 0;
  let isOwner = false;

  if (isSupabaseConfigured) {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (user && workspace) {
      const [{ data: rows }, { data: campaigns }, { count }, { data: myMembership }] = await Promise.all([
        supabase
          .from("ad_networks")
          .select("id, name")
          .eq("workspace_id", workspace.id)
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase.from("campaigns").select("id, network_id").eq("workspace_id", workspace.id),
        supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace.id)
          .eq("read", false),
        supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspace.id)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const syncedIds = new Set((campaigns ?? []).map((c) => c.network_id));
      networks = (rows ?? []).map((n) => ({ id: n.id, name: n.name, synced: syncedIds.has(n.id) }));
      unreadAlerts = count ?? 0;
      isOwner = myMembership?.role === "Owner";
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar networks={networks} unreadAlerts={unreadAlerts} isOwner={isOwner} />
      <div className="flex-1 flex flex-col min-w-0 pt-14 lg:pt-0">
        <Topbar unreadAlerts={unreadAlerts} />
        <main className="flex-1 p-4 lg:p-6 space-y-5">{children}</main>
      </div>
    </div>
  );
}
