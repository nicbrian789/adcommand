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
import {
  getTrafficFactorySessionToken,
  updateTrafficFactoryCampaign,
  listTrafficFactoryVariations,
  uploadTrafficFactoryLibraryFile,
  createTrafficFactoryVariation,
  deleteTrafficFactoryVariation,
  type TrafficFactoryVariation,
} from "@/lib/integrations/trafficfactory";

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

async function resolveTrafficFactoryCampaign(campaignId: string) {
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
  if (!campaign.external_id) throw new Error("Campaign ini belum punya ID Traffic Factory.");

  const { data: network, error: networkError } = await supabase
    .from("ad_networks")
    .select("provider")
    .eq("id", campaign.network_id)
    .maybeSingle();
  if (networkError || !network || network.provider !== "traffic_factory") {
    throw new Error("Aksi ini cuma tersedia buat campaign Traffic Factory.");
  }

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
    p_network_id: campaign.network_id,
  });
  if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

  const sessionToken = await getTrafficFactorySessionToken(apiKey);

  return { supabase, campaign, sessionToken, externalId: Number(campaign.external_id) };
}

const TF_STATUS_TO_LOCAL: Record<number, string> = { 1: "Running", 0: "Paused", [-1]: "Stopped" };

export async function updateTrafficFactoryCampaignAction(
  campaignId: string,
  input: {
    name: string;
    status: number;
    pricingModel: number;
    price: number;
    maxDailyBudget: number;
    totalBudgetLimit: number;
    countries: string[];
    categoryIds: number[];
    deviceIds: number[];
    browserIds: number[];
    osIds: number[];
    languageIds: number[];
    startDate: string;
    endDate: string;
    totalImpressions: number;
    maxDailyImpressions: number;
    frequencyCappingEnabled: boolean;
    frequencyCappingImpressions: number;
    frequencyCappingMinutes: number;
    sitesMode: "targeted" | "blocked";
    sites: string[];
    keywordsMode: "targeted" | "blocked";
    keywords: string[];
    ipRangesMode: "targeted" | "blocked";
    ipRanges: string[];
  }
): Promise<void> {
  try {
    if (!input.name.trim()) throw new Error("Nama campaign wajib diisi.");
    if (!input.price || input.price <= 0) throw new Error("Harga/bid harus lebih dari 0.");

    const { supabase, campaign, sessionToken, externalId } = await resolveTrafficFactoryCampaign(campaignId);

    await updateTrafficFactoryCampaign(sessionToken, externalId, {
      name: input.name.trim(),
      status: input.status,
      pricingModel: input.pricingModel,
      price: input.price,
      maxDailyBudget: input.maxDailyBudget,
      totalBudgetLimit: input.totalBudgetLimit,
      countries: input.countries,
      categoryIds: input.categoryIds,
      deviceIds: input.deviceIds,
      browserIds: input.browserIds,
      osIds: input.osIds,
      languageIds: input.languageIds,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      totalImpressions: input.totalImpressions,
      maxDailyImpressions: input.maxDailyImpressions,
      frequencyCapping: {
        enabled: input.frequencyCappingEnabled,
        impressions: input.frequencyCappingImpressions || undefined,
        minutes: input.frequencyCappingMinutes || undefined,
      },
      sites: { targeted: input.sitesMode === "targeted" ? input.sites : [], blocked: input.sitesMode === "blocked" ? input.sites : [] },
      keywords: {
        targeted: input.keywordsMode === "targeted" ? input.keywords : [],
        blocked: input.keywordsMode === "blocked" ? input.keywords : [],
      },
      ipRanges: {
        targeted: input.ipRangesMode === "targeted" ? input.ipRanges : [],
        blocked: input.ipRangesMode === "blocked" ? input.ipRanges : [],
      },
    });

    const { error: updateError } = await supabase
      .from("campaigns")
      .update({ name: input.name.trim(), status: TF_STATUS_TO_LOCAL[input.status] ?? "Draft" })
      .eq("id", campaign.id);
    if (updateError) console.error("Gagal update nama/status campaign lokal:", updateError.message);

    revalidatePath("/dashboard/campaigns");
    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
    revalidatePath("/dashboard");
  } catch (err) {
    console.error("updateTrafficFactoryCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat update campaign.";
    throw new Error(message);
  }
}

export async function listTrafficFactoryVariationsAction(campaignId: string): Promise<TrafficFactoryVariation[]> {
  try {
    const { sessionToken, externalId } = await resolveTrafficFactoryCampaign(campaignId);
    return await listTrafficFactoryVariations(sessionToken, externalId);
  } catch (err) {
    console.error("listTrafficFactoryVariationsAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal ambil daftar creative.";
    throw new Error(message);
  }
}

export async function addTrafficFactoryVariationAction(
  campaignId: string,
  input: { durl: string; images: File[] }
): Promise<{ created: number }> {
  try {
    if (!input.durl.trim() || !/^https?:\/\//i.test(input.durl.trim())) {
      throw new Error("Landing URL wajib diisi, diawali http:// atau https://");
    }
    const validImages = input.images.filter((f) => f && f.size > 0);
    if (validImages.length === 0) throw new Error("Pilih minimal 1 gambar.");

    const { sessionToken, externalId } = await resolveTrafficFactoryCampaign(campaignId);

    let created = 0;
    for (const file of validImages) {
      const libraryFile = await uploadTrafficFactoryLibraryFile(sessionToken, file);
      await createTrafficFactoryVariation(sessionToken, externalId, { idLibraryFile: libraryFile.id, durl: input.durl.trim() });
      created += 1;
    }

    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
    return { created };
  } catch (err) {
    console.error("addTrafficFactoryVariationAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal upload creative.";
    throw new Error(message);
  }
}

export async function deleteTrafficFactoryVariationAction(campaignId: string, variationId: number): Promise<void> {
  try {
    const { sessionToken, externalId } = await resolveTrafficFactoryCampaign(campaignId);
    await deleteTrafficFactoryVariation(sessionToken, externalId, variationId);
    revalidatePath(`/dashboard/campaigns/${campaignId}/edit`);
  } catch (err) {
    console.error("deleteTrafficFactoryVariationAction error:", err);
    const message = err instanceof Error ? err.message : "Gagal hapus creative.";
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
