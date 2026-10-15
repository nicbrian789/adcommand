"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTrafficStarsAccessToken,
  setTrafficStarsCampaignRunState,
} from "@/lib/integrations/trafficstars";

async function getCampaignAndToken(campaignId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, external_id, network_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) throw new Error("Campaign tidak ditemukan.");
  if (!campaign.external_id) throw new Error("Campaign ini belum punya ID TrafficStars.");

  const { data: network, error: networkError } = await supabase
    .from("ad_networks")
    .select("provider")
    .eq("id", campaign.network_id)
    .maybeSingle();
  if (networkError || !network || network.provider !== "trafficstars") {
    throw new Error("Aksi ini cuma tersedia buat campaign TrafficStars.");
  }

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
    p_network_id: campaign.network_id,
  });
  if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

  const accessToken = await getTrafficStarsAccessToken(apiKey);

  return { supabase, campaign, accessToken, externalId: Number(campaign.external_id) };
}

export async function setTrafficStarsCampaignRunStateAction(
  campaignId: string,
  action: "run" | "pause"
): Promise<{ status: string }> {
  try {
    const { supabase, campaign, accessToken, externalId } = await getCampaignAndToken(campaignId);

    await setTrafficStarsCampaignRunState(accessToken, externalId, action);

    const status = action === "pause" ? "Paused" : "Running";
    const { error: updateError } = await supabase.from("campaigns").update({ status }).eq("id", campaign.id);
    if (updateError) console.error("Gagal update status campaign lokal:", updateError.message);

    revalidatePath("/dashboard/campaigns");
    revalidatePath("/dashboard");

    return { status };
  } catch (err) {
    console.error("setTrafficStarsCampaignRunStateAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    throw new Error(message);
  }
}
