"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NETWORK_TYPES } from "@/lib/networks";
import type { SupabaseClient } from "@supabase/supabase-js";

async function seedDefaultNetworks(admin: SupabaseClient, workspaceId: string, userId: string) {
  const { data: existing } = await admin.from("ad_networks").select("provider").eq("user_id", userId);
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

export async function inviteMember(email: string, fullName: string) {
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

  if (membership?.role !== "Owner") throw new Error("Cuma Owner yang bisa undang anggota baru.");

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const redirectTo = host ? `${protocol}://${host}/reset-password` : undefined;

  const admin = createAdminClient();
  const { data: inviteData, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo,
  });

  if (error) throw new Error(error.message);

  const newUserId = inviteData.user?.id;
  if (newUserId) {
    await seedDefaultNetworks(admin, workspace.id, newUserId);
  }

  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/networks");
}

export async function addDefaultNetworksForMember(targetUserId: string) {
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

  const admin = createAdminClient();
  const added = await seedDefaultNetworks(admin, workspace.id, targetUserId);

  revalidatePath("/dashboard/networks");
  revalidatePath("/dashboard/members");

  return { added };
}

export async function promoteToOwner(targetUserId: string) {
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
  if (membership?.role !== "Owner") throw new Error("Cuma Owner yang bisa jadiin orang lain Owner.");

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

export async function removeMember(targetUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.role !== "Owner") throw new Error("Cuma Owner yang bisa hapus anggota.");
  if (targetUserId === user.id) throw new Error("Gak bisa hapus akun sendiri.");

  const admin = createAdminClient();

  const { data: targetMembership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetMembership?.role === "Owner") throw new Error("Gak bisa hapus Owner lain.");

  await admin.from("ad_networks").delete().eq("user_id", targetUserId);
  await admin.from("workspace_members").delete().eq("user_id", targetUserId);
  await admin.from("profiles").delete().eq("id", targetUserId);

  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/networks");
}
