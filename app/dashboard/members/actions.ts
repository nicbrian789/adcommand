"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NETWORK_TYPES } from "@/lib/networks";
import type { SupabaseClient } from "@supabase/supabase-js";

async function seedDefaultNetworks(admin: SupabaseClient, workspaceId: string, userId: string) {
  const { data: existing } = await admin
    .from("ad_networks")
    .select("provider")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  const existingProviders = new Set((existing ?? []).map((n) => n.provider));

  const missing = NETWORK_TYPES.filter((t) => t.value !== "other" && !existingProviders.has(t.value)).map((t) => ({
    workspace_id: workspaceId,
    user_id: userId,
    name: t.label,
    provider: t.value,
    enabled: true,
  }));

  if (missing.length === 0) return 0;
  await admin.from("ad_networks").insert(missing);
  return missing.length;
}

async function ensureWorkspaceMember(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
  role: "Member" | "Owner" = "Member"
) {
  const { data: existing, error: existingError } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return;

  const { error } = await admin.from("workspace_members").insert({
    workspace_id: workspaceId,
    user_id: userId,
    role,
  });
  if (error) throw new Error(error.message);
}

async function requireOwnerWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!workspace) throw new Error("Belum ada workspace.");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "Owner") throw new Error("Cuma Owner yang bisa lakuin ini.");

  return { user, workspace };
}

async function findUserIdByEmail(admin: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data: profile } = await admin.from("profiles").select("id").eq("email", normalized).maybeSingle();
  if (profile?.id) return profile.id as string;

  // Fallback: scan auth users (invite often fails when akun sudah ada).
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

export async function inviteMember(email: string, fullName: string) {
  const { workspace } = await requireOwnerWorkspace();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) throw new Error("Email wajib diisi.");

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const redirectTo = host ? `${protocol}://${host}/reset-password` : undefined;

  const admin = createAdminClient();
  const { data: inviteData, error } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo,
  });

  let newUserId = inviteData.user?.id ?? null;

  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    if (!already) throw new Error(error.message);

    newUserId = await findUserIdByEmail(admin, trimmedEmail);
    if (!newUserId) throw new Error(error.message);
  }

  if (!newUserId) throw new Error("Gagal mendapatkan user dari undangan.");

  if (fullName.trim()) {
    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ id: newUserId, email: trimmedEmail, full_name: fullName.trim() }, { onConflict: "id" });
    if (profileError) console.error("Gagal update profile undangan:", profileError.message);
  }

  await ensureWorkspaceMember(admin, workspace.id, newUserId, "Member");
  await seedDefaultNetworks(admin, workspace.id, newUserId);

  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/networks");
}

export async function addDefaultNetworksForMember(targetUserId: string) {
  const { workspace } = await requireOwnerWorkspace();

  const admin = createAdminClient();
  const { data: targetMembership } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!targetMembership) throw new Error("User ini bukan anggota workspace.");

  const added = await seedDefaultNetworks(admin, workspace.id, targetUserId);

  revalidatePath("/dashboard/networks");
  revalidatePath("/dashboard/members");

  return { added };
}

export async function promoteToOwner(targetUserId: string) {
  const { workspace } = await requireOwnerWorkspace();

  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_members")
    .update({ role: "Owner" })
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard");
}

/**
 * Lepas anggota dari workspace saat ini.
 * Tidak menghapus akun Auth / profile global — hanya membership + network di workspace ini.
 */
export async function removeMember(targetUserId: string) {
  const { user, workspace } = await requireOwnerWorkspace();
  if (targetUserId === user.id) throw new Error("Gak bisa hapus akun sendiri.");

  const admin = createAdminClient();

  const { data: targetMembership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!targetMembership) throw new Error("User ini bukan anggota workspace.");
  if (targetMembership.role === "Owner") throw new Error("Gak bisa hapus Owner lain.");

  const { error: networksError } = await admin
    .from("ad_networks")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId);
  if (networksError) throw new Error(networksError.message);

  const { error: memberError } = await admin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("user_id", targetUserId);
  if (memberError) throw new Error(memberError.message);

  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/networks");
}
