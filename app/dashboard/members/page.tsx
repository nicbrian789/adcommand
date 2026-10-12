import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { InviteMemberForm } from "@/components/dashboard/InviteMemberForm";
import { Users, AlertTriangle } from "lucide-react";

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
  email: string;
  full_name: string | null;
};

const roleStyle: Record<string, string> = {
  Owner: "bg-accent/15 text-accent",
  Member: "bg-success/15 text-success",
  Viewer: "bg-muted/15 text-muted",
};

async function getMembers(): Promise<
  { workspaceName: string; members: MemberRow[]; isOwner: boolean } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workspaceError) return { error: workspaceError.message };
  if (!workspace) return { workspaceName: "", members: [], isOwner: false };

  const { data: myMembership } = user
    ? await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const isOwner = myMembership?.role === "Owner";

  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("user_id, role, created_at")
    .eq("workspace_id", workspace.id);

  if (membersError) return { error: membersError.message };
  if (!members || members.length === 0) return { workspaceName: workspace.name, members: [], isOwner };

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in(
      "id",
      members.map((m) => m.user_id)
    );

  if (profilesError) return { error: profilesError.message };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: MemberRow[] = members
    .map((m) => {
      const profile = profileMap.get(m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        email: profile?.email ?? "(unknown)",
        full_name: profile?.full_name ?? null,
      };
    })
    .sort((a, b) => (a.role === "Owner" ? -1 : b.role === "Owner" ? 1 : 0));

  return { workspaceName: workspace.name, members: rows, isOwner };
}

export default async function MembersPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi. Isi `.env.local` dulu untuk melihat data anggota workspace.
      </div>
    );
  }

  const result = await getMembers();

  if ("error" in result) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger flex flex-col items-center gap-2">
        <AlertTriangle size={24} />
        <p className="font-medium">Gagal memuat data anggota</p>
        <p className="text-sm">{result.error}</p>
      </div>
    );
  }

  const { workspaceName, members, isOwner } = result;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Users & Access</h1>
        <p className="text-sm text-muted">
          Anggota workspace {workspaceName ? `"${workspaceName}"` : ""} dan role masing-masing.
        </p>
      </div>

      {isOwner ? <InviteMemberForm /> : null}

      <div className="rounded-xl border border-border bg-surface">
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
            <Users size={28} className="mb-3" />
            <p className="text-sm font-medium text-foreground">Belum ada anggota</p>
            <p className="text-xs mt-1">Workspace ini belum punya member terdaftar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="font-medium px-4 py-3">Name</th>
                <th className="font-medium px-4 py-3">Email</th>
                <th className="font-medium px-4 py-3">Role</th>
                <th className="font-medium px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{m.full_name || "-"}</td>
                  <td className="px-4 py-3 text-muted">{m.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleStyle[m.role] ?? "bg-muted/15 text-muted"}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(m.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
