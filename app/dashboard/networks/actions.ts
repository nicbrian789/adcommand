"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSyncSupported } from "@/lib/networks";
import { runNetworkSync } from "@/lib/networkSync";

export async function syncNetwork(networkId: string): Promise<{ campaigns: number; days: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { data: network, error: networkError } = await supabase
    .from("ad_networks")
    .select("id, name, workspace_id, provider")
    .eq("id", networkId)
    .maybeSingle();

  if (networkError || !network) throw new Error("Network tidak ditemukan.");
  if (!isSyncSupported(network.provider)) throw new Error("Sync belum tersedia untuk jenis network ini.");

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
    p_network_id: networkId,
  });
  if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

  const result = await runNetworkSync(supabase, network, apiKey);

  revalidatePath("/dashboard/networks");
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/geo");
  revalidatePath("/dashboard/alerts");

  return result;
}
