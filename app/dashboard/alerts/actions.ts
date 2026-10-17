"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markAlertRead(alertId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("alerts").update({ read: true }).eq("id", alertId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/alerts");
}

export async function markAllAlertsRead(workspaceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("alerts").update({ read: true }).eq("workspace_id", workspaceId).eq("read", false);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/alerts");
}

export async function markAlertsSeen(alertIds: string[]) {
  if (alertIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("alerts").update({ read: true }).in("id", alertIds);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/alerts");
}
