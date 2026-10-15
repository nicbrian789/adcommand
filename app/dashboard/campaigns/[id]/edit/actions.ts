"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTrafficStarsAccessToken,
  updateTrafficStarsCampaign,
  listTrafficStarsBanners,
  createTrafficStarsBanner,
  updateTrafficStarsBanner,
  deleteTrafficStarsBanner,
  uploadTrafficStarsBannerImage,
  type TrafficStarsBanner,
} from "@/lib/integrations/trafficstars";

async function resolveTrafficStarsCampaign(campaignId: string) {
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

export async function updateTrafficStarsCampaignAction(
  campaignId: string,
  input: {
    name: string;
    price: number;
    maxDaily: number;
    totalBudget: number;
    weight: number;
    trafficType: "ron" | "prime" | "members_area" | "";
  }
): Promise<{ status: string }> {
  try {
    if (!input.name.trim()) throw new Error("Nama campaign wajib diisi.");
    if (!input.price || input.price <= 0) throw new Error("Harga/bid harus lebih dari 0.");
    if (!input.maxDaily || input.maxDaily <= 0) throw new Error("Budget harian max wajib diisi (lebih dari 0).");

    const { supabase, campaign, accessToken, externalId } = await resolveTrafficStarsCampaign(campaignId);

    const result = await updateTrafficStarsCampaign(accessToken, externalId, {
      name: input.name,
      price: input.price,
      maxDaily: input.maxDaily,
      totalBudget: input.totalBudget,
      weight: input.weight,
      trafficType: input.trafficType || undefined,
    });

    const { error: updateError } = await supabase.from("campaigns").update({ name: input.name }).eq("id", campaign.id);
    if (updateError) console.error("Gagal update nama campaign lokal:", updateError.message);

    revalidatePath("/dashboard/campaigns");
    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
    revalidatePath("/dashboard");

    return { status: String(result?.status ?? "") };
  } catch (err) {
    console.error("updateTrafficStarsCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat update campaign.";
    throw new Error(message);
  }
}

export async function listCampaignBannersAction(campaignId: string): Promise<TrafficStarsBanner[]> {
  try {
    const { accessToken, externalId } = await resolveTrafficStarsCampaign(campaignId);
    return await listTrafficStarsBanners(accessToken, externalId);
  } catch (err) {
    console.error("listCampaignBannersAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal ambil daftar banner.";
    throw new Error(message);
  }
}

export async function addCampaignBannerAction(
  campaignId: string,
  input: {
    landingUrl: string;
    images: File[];
    headline: string;
    brandname: string;
    ctaBrandname: string;
    frequencyCapping: number;
  }
): Promise<{ banners: { id: number; uploaded: boolean }[] }> {
  try {
    if (!input.landingUrl.trim() || !/^https?:\/\//i.test(input.landingUrl.trim())) {
      throw new Error("Landing URL wajib diisi, diawali http:// atau https://");
    }

    const { accessToken, externalId } = await resolveTrafficStarsCampaign(campaignId);
    const validImages = input.images.filter((f) => f && f.size > 0);
    const rounds = validImages.length > 0 ? validImages : [null];
    const banners: { id: number; uploaded: boolean }[] = [];

    for (const file of rounds) {
      const banner = await createTrafficStarsBanner(accessToken, {
        campaignId: externalId,
        landingUrl: input.landingUrl.trim(),
        headline: input.headline.trim() || undefined,
        brandname: input.brandname.trim() || undefined,
        ctaBrandname: input.ctaBrandname.trim() || undefined,
        frequencyCapping: input.frequencyCapping,
      });

      const bannerId = Number(banner?.id);
      if (!Number.isFinite(bannerId)) {
        throw new Error(`Respons banner TrafficStars tidak terduga: ${JSON.stringify(banner).slice(0, 400)}`);
      }

      let uploaded = false;
      if (file) {
        await uploadTrafficStarsBannerImage(accessToken, bannerId, file);
        uploaded = true;
      }
      banners.push({ id: bannerId, uploaded });
    }

    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
    return { banners };
  } catch (err) {
    console.error("addCampaignBannerAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat bikin banner.";
    throw new Error(message);
  }
}

export async function updateCampaignBannerAction(
  campaignId: string,
  bannerId: number,
  input: {
    landingUrl?: string;
    landingUrlId?: number;
    headline?: string;
    brandname?: string;
    ctaBrandname?: string;
    frequencyCapping?: number;
  }
): Promise<void> {
  try {
    const { accessToken } = await resolveTrafficStarsCampaign(campaignId);
    await updateTrafficStarsBanner(accessToken, bannerId, input);
    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
  } catch (err) {
    console.error("updateCampaignBannerAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal update banner.";
    throw new Error(message);
  }
}

export async function deleteCampaignBannerAction(campaignId: string, bannerId: number): Promise<void> {
  try {
    const { accessToken } = await resolveTrafficStarsCampaign(campaignId);
    await deleteTrafficStarsBanner(accessToken, bannerId);
    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
  } catch (err) {
    console.error("deleteCampaignBannerAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal hapus banner.";
    throw new Error(message);
  }
}

export async function replaceCampaignBannerImageAction(campaignId: string, bannerId: number, file: File): Promise<void> {
  try {
    const { accessToken } = await resolveTrafficStarsCampaign(campaignId);
    await uploadTrafficStarsBannerImage(accessToken, bannerId, file);
    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
  } catch (err) {
    console.error("replaceCampaignBannerImageAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal ganti gambar banner.";
    throw new Error(message);
  }
}
