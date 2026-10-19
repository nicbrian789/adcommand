"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTrafficStarsAccessToken, setTrafficStarsCampaignRunState } from "@/lib/integrations/trafficstars";
import {
  getTrafficFactorySessionToken,
  setTrafficFactoryCampaignsRunState,
  deleteTrafficFactoryCampaigns,
} from "@/lib/integrations/trafficfactory";
import { isDeleteCampaignSupported, isManageCampaignSupported } from "@/lib/networks";

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
  if (!campaign.external_id) throw new Error("Campaign ini belum punya external ID.");

  const { data: network, error: networkError } = await supabase
    .from("ad_networks")
    .select("provider")
    .eq("id", campaign.network_id)
    .maybeSingle();
  if (networkError || !network || !isManageCampaignSupported(network.provider)) {
    throw new Error("Aksi ini belum tersedia buat jenis network campaign ini.");
  }

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
    p_network_id: campaign.network_id,
  });
  if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

  return { supabase, campaign, provider: network.provider as string, apiKey: apiKey as string, externalId: campaign.external_id };
}

/** Pause/Resume, dispatched by provider. Shared by CampaignPauseButton regardless of network type. */
export async function setCampaignRunStateAction(campaignId: string, action: "run" | "pause"): Promise<{ status: string }> {
  try {
    const { supabase, campaign, provider, apiKey, externalId } = await getCampaignAndToken(campaignId);

    if (provider === "trafficstars") {
      const accessToken = await getTrafficStarsAccessToken(apiKey);
      await setTrafficStarsCampaignRunState(accessToken, Number(externalId), action);
    } else if (provider === "traffic_factory") {
      const sessionToken = await getTrafficFactorySessionToken(apiKey);
      await setTrafficFactoryCampaignsRunState(sessionToken, [Number(externalId)], action === "run" ? "play" : "pause");
    } else {
      throw new Error("Aksi ini belum tersedia buat jenis network campaign ini.");
    }

    const status = action === "pause" ? "Paused" : "Running";
    const { error: updateError } = await supabase.from("campaigns").update({ status }).eq("id", campaign.id);
    if (updateError) console.error("Gagal update status campaign lokal:", updateError.message);

    revalidatePath("/dashboard/campaigns");
    revalidatePath("/dashboard");

    return { status };
  } catch (err) {
    console.error("setCampaignRunStateAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    throw new Error(message);
  }
}

/** Real delete — only Traffic Factory supports this; TrafficStars has no delete endpoint (pause is the equivalent there). */
export async function deleteCampaignAction(campaignId: string): Promise<void> {
  try {
    const { supabase, campaign, provider, apiKey, externalId } = await getCampaignAndToken(campaignId);
    if (!isDeleteCampaignSupported(provider)) {
      throw new Error("Delete cuma tersedia buat campaign Traffic Factory sekarang.");
    }

    const sessionToken = await getTrafficFactorySessionToken(apiKey);
    await deleteTrafficFactoryCampaigns(sessionToken, [Number(externalId)]);

    const { error: deleteError } = await supabase.from("campaigns").delete().eq("id", campaign.id);
    if (deleteError) console.error("Gagal hapus campaign lokal:", deleteError.message);

    revalidatePath("/dashboard/campaigns");
    revalidatePath("/dashboard");
  } catch (err) {
    console.error("deleteCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.";
    throw new Error(message);
  }
}
