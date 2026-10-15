"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTrafficStarsAccessToken,
  createTrafficStarsCampaign,
  createTrafficStarsBanner,
  uploadTrafficStarsBannerImage,
} from "@/lib/integrations/trafficstars";

export async function createTrafficStarsCampaignAction(
  networkId: string,
  input: {
    name: string;
    formatId: number;
    adType: string;
    pricingModel: "cpm" | "cpc" | "cpa";
    price: number;
    maxDaily: number;
    totalBudget: number;
    countries: string[];
    trafficType: "ron" | "prime" | "members_area";
    weight: number;
    scheduleStartDate: string;
  }
): Promise<{ id: number; status: string }> {
  try {
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
    if (network.provider !== "trafficstars") throw new Error("Network ini bukan TrafficStars.");

    if (!input.name.trim()) throw new Error("Nama campaign wajib diisi.");
    if (!input.formatId) throw new Error("Pilih format iklan dulu.");
    if (!input.adType) throw new Error("Pilih jenis iklan dulu.");
    if (!input.price || input.price <= 0) throw new Error("Harga/bid harus lebih dari 0.");

    const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
      p_network_id: networkId,
    });
    if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

    const accessToken = await getTrafficStarsAccessToken(apiKey);

    const result = await createTrafficStarsCampaign(accessToken, {
      name: input.name,
      formatId: input.formatId,
      adType: input.adType,
      pricingModel: input.pricingModel,
      price: input.price,
      maxDaily: input.maxDaily,
      totalBudget: input.totalBudget,
      countries: input.countries,
      trafficType: input.trafficType,
      weight: input.weight,
      scheduleStartDate: input.scheduleStartDate,
    });

    const campaignId = Number(result?.id);
    const status = result?.status === "approved" ? "Running" : "Draft";

    if (!Number.isFinite(campaignId)) {
      throw new Error(`Respons TrafficStars tidak terduga: ${JSON.stringify(result).slice(0, 400)}`);
    }

    const { error: insertError } = await supabase.from("campaigns").insert({
      workspace_id: network.workspace_id,
      network_id: network.id,
      external_id: String(campaignId),
      name: input.name,
      status,
    });
    if (insertError) {
      console.error("Gagal simpan campaign baru ke database:", insertError.message);
    }

    try {
      revalidatePath("/dashboard/networks");
      revalidatePath("/dashboard/campaigns");
      revalidatePath("/dashboard");
    } catch (revalidateErr) {
      console.error("revalidatePath gagal:", revalidateErr);
    }

    return { id: campaignId, status };
  } catch (err) {
    console.error("createTrafficStarsCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat bikin campaign.";
    throw new Error(message);
  }
}

export async function createTrafficStarsBannerAction(
  networkId: string,
  input: { campaignId: number; landingUrl: string; images: File[] }
): Promise<{ banners: { id: number; uploaded: boolean }[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

    if (!input.landingUrl.trim() || !/^https?:\/\//i.test(input.landingUrl.trim())) {
      throw new Error("Landing URL wajib diisi, diawali http:// atau https://");
    }

    const { data: network } = await supabase
      .from("ad_networks")
      .select("id, provider")
      .eq("id", networkId)
      .maybeSingle();
    if (!network || network.provider !== "trafficstars") throw new Error("Network tidak ditemukan.");

    const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
      p_network_id: networkId,
    });
    if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

    const accessToken = await getTrafficStarsAccessToken(apiKey);
    const validImages = input.images.filter((f) => f && f.size > 0);

    // Minimal 1 banner dibuat (tanpa gambar kalau nggak ada file sama sekali),
    // atau 1 banner per gambar kalau user upload beberapa sekaligus.
    const rounds = validImages.length > 0 ? validImages : [null];
    const banners: { id: number; uploaded: boolean }[] = [];

    for (const file of rounds) {
      const banner = await createTrafficStarsBanner(accessToken, {
        campaignId: input.campaignId,
        landingUrl: input.landingUrl.trim(),
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

    return { banners };
  } catch (err) {
    console.error("createTrafficStarsBannerAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat bikin banner.";
    throw new Error(message);
  }
}
