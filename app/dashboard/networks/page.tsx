import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AddNetworkForm } from "@/components/dashboard/AddNetworkForm";
import { NetworksByMember } from "@/components/dashboard/NetworksByMember";
import { Share2, AlertTriangle } from "lucide-react";

type NetworkRow = {
  id: string;
  name: string;
  provider: string | null;
  enabled: boolean;
  created_at: string;
  user_id: string;
  hasKey: boolean;
};

async function getNetworks(): Promise<
  | {
      workspaceId: string;
      workspaceName: string;
      currentUserId: string;
      isOwner: boolean;
      networks: NetworkRow[];
      campaignCounts: Record<string, number>;
      memberName: Map<string, string>;
    }
  | { error: string }
> {
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
  if (!workspace) {
    return {
      workspaceId: "",
      workspaceName: "",
      currentUserId: user.id,
      isOwner: false,
      networks: [],
      campaignCounts: {},
      memberName: new Map(),
    };
  }

  const [
    { data: rawNetworks, error: networksError },
    { data: campaigns, error: campaignsError },
    { data: myMembership },
  ] = await Promise.all([
    supabase
      .from("ad_networks")
      .select("id, name, provider, enabled, created_at, user_id, credential_ref")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false }),
    supabase.from("campaigns").select("network_id").eq("workspace_id", workspace.id),
    supabase.from("workspace_members").select("role").eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle(),
  ]);

  if (networksError) return { error: networksError.message };
  if (campaignsError) return { error: campaignsError.message };

  const networks: NetworkRow[] = (rawNetworks ?? []).map(({ credential_ref, ...n }) => ({
    ...n,
    hasKey: credential_ref !== null,
  }));

  const campaignCounts: Record<string, number> = {};
  for (const c of campaigns ?? []) {
    campaignCounts[c.network_id] = (campaignCounts[c.network_id] ?? 0) + 1;
  }

  const ownerIds = [...new Set(networks.map((n) => n.user_id))];
  const { data: profiles } = ownerIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] };

  const memberName = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "(tanpa nama)"])
  );

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    currentUserId: user.id,
    isOwner: myMembership?.role === "Owner",
    networks,
    campaignCounts,
    memberName,
  };
}

export default async function NetworksPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi. Isi `.env.local` dulu untuk mengelola ad network.
      </div>
    );
  }

  const result = await getNetworks();

  if ("error" in result) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat data ad network</p>
        <p className="text-sm">{result.error}</p>
      </div>
    );
  }

  const { workspaceId, workspaceName, currentUserId, isOwner, networks, campaignCounts, memberName } = result;

  const networksByOwner = new Map<string, NetworkRow[]>();
  for (const n of networks) {
    const arr = networksByOwner.get(n.user_id) ?? [];
    arr.push(n);
    networksByOwner.set(n.user_id, arr);
  }

  const ownerGroups = [...networksByOwner.entries()]
    .map(([userId, rows]) => ({
      userId,
      name: userId === currentUserId ? "Saya" : (memberName.get(userId) ?? "(tanpa nama)"),
      rows,
    }))
    .sort((a, b) => {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Ad Networks</h1>
          <p className="text-sm text-muted">
            Daftar ad network workspace {workspaceName ? `"${workspaceName}"` : ""}.
          </p>
        </div>
        {workspaceId ? <AddNetworkForm workspaceId={workspaceId} /> : null}
      </div>

      {networks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface flex flex-col items-center justify-center py-16 text-center text-muted">
          <Share2 size={28} className="mb-3" />
          <p className="text-sm font-medium text-foreground">Belum ada ad network</p>
          <p className="text-xs mt-1">
            Tambahkan network pertama kamu (misal TrafficJunky, Adsterra) lewat tombol di atas.
          </p>
        </div>
      ) : (
        <NetworksByMember
          groups={ownerGroups}
          currentUserId={currentUserId}
          isOwner={isOwner}
          campaignCounts={campaignCounts}
        />
      )}

      <p className="text-xs text-muted">
        Catatan: ini baru daftar network manual. Belum ada tarik data otomatis (spend/klik) dari API masing-masing network.
      </p>
    </div>
  );
}
