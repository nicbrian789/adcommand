import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let networks: { id: string; name: string; synced: boolean }[] = [];
  let unreadAlerts = 0;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("ad_networks")
      .select("id, name")
      .order("name", { ascending: true });

    const { data: statRows } = await supabase.from("campaign_stats").select("campaign_id");
    const statCampaignIds = [...new Set((statRows ?? []).map((s) => s.campaign_id))];

    const { data: campaigns } = statCampaignIds.length
      ? await supabase.from("campaigns").select("id, network_id").in("id", statCampaignIds)
      : { data: [] };
    const syncedIds = new Set((campaigns ?? []).map((c) => c.network_id));

    networks = (rows ?? []).map((n) => ({ id: n.id, name: n.name, synced: syncedIds.has(n.id) }));

    const { count } = await supabase.from("alerts").select("id", { count: "exact", head: true }).eq("read", false);
    unreadAlerts = count ?? 0;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar networks={networks} unreadAlerts={unreadAlerts} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar unreadAlerts={unreadAlerts} />
        <main className="flex-1 p-4 lg:p-6 space-y-5">{children}</main>
      </div>
    </div>
  );
}
