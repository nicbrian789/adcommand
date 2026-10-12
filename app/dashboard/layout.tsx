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

    const [
      {
        data: { user },
      },
      { data: statRows },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("campaign_stats").select("campaign_id"),
    ]);

    const statCampaignIds = [...new Set((statRows ?? []).map((s) => s.campaign_id))];

    const [{ data: rows }, { data: campaigns }, { count }, { data: myMembership }] = await Promise.all([
      user
        ? supabase.from("ad_networks").select("id, name").eq("user_id", user.id).order("name", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      statCampaignIds.length
        ? supabase.from("campaigns").select("id, network_id").in("id", statCampaignIds)
        : Promise.resolve({ data: [] as { id: string; network_id: string }[] }),
      supabase.from("alerts").select("id", { count: "exact", head: true }).eq("read", false),
      user
        ? supabase.from("workspace_members").select("role").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null as { role: string } | null }),
    ]);

    const syncedIds = new Set((campaigns ?? []).map((c) => c.network_id));
    networks = (rows ?? []).map((n) => ({ id: n.id, name: n.name, synced: syncedIds.has(n.id) }));
    unreadAlerts = count ?? 0;
    isOwner = myMembership?.role === "Owner";
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar networks={networks} unreadAlerts={unreadAlerts} isOwner={isOwner} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar unreadAlerts={unreadAlerts} />
        <main className="flex-1 p-4 lg:p-6 space-y-5">{children}</main>
      </div>
    </div>
  );
}
