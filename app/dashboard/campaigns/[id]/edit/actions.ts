"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTrafficStarsAccessToken, updateTrafficStarsCampaign } from "@/lib/integrations/trafficstars";

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

    if (!input.name.trim()) throw new Error("Nama campaign wajib diisi.");
    if (!input.price || input.price <= 0) throw new Error("Harga/bid harus lebih dari 0.");

    const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
      p_network_id: campaign.network_id,
    });
    if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

    const accessToken = await getTrafficStarsAccessToken(apiKey);

    const result = await updateTrafficStarsCampaign(accessToken, Number(campaign.external_id), {
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
    revalidatePath("/dashboard");

    return { status: String(result?.status ?? "") };
  } catch (err) {
    console.error("updateTrafficStarsCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat update campaign.";
    throw new Error(message);
  }
}
