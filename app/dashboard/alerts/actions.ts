"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireSessionWorkspace() {
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

  return { user, workspace };
}

export async function markAlertRead(alertId: string) {
  const { workspace } = await requireSessionWorkspace();

  const admin = createAdminClient();
  const { error } = await admin.from("alerts").update({ read: true }).eq("id", alertId).eq("workspace_id", workspace.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/alerts");
}

export async function markAllAlertsRead(workspaceId: string) {
  await requireSessionWorkspace();

  const admin = createAdminClient();
  const { error } = await admin.from("alerts").update({ read: true }).eq("workspace_id", workspaceId).eq("read", false);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/alerts");
}

export async function markAlertsSeen(alertIds: string[]) {
  if (alertIds.length === 0) return;
  const { workspace } = await requireSessionWorkspace();

  const admin = createAdminClient();
  const { error } = await admin.from("alerts").update({ read: true }).in("id", alertIds).eq("workspace_id", workspace.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/alerts");
}
