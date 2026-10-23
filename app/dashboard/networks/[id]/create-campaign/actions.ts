"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getTrafficStarsAccessToken,
  createTrafficStarsCampaign,
  createTrafficStarsBanner,
  uploadTrafficStarsBannerImage,
} from "@/lib/integrations/trafficstars";
import {
  getTrafficFactorySessionToken,
  createTrafficFactoryCampaign,
  uploadTrafficFactoryLibraryFile,
  uploadTrafficFactoryLibraryUrl,
  createTrafficFactoryVariation,
} from "@/lib/integrations/trafficfactory";
import {
  createAdsterraCampaignRequest,
  getAdsterraRegions,
  getAdsterraCities,
  getAdsterraCarriers,
  getAdsterraBrowserVersions,
  getAdsterraOperatingSystemVersions,
  type CreateAdsterraCampaignInput,
  type AdsterraDictItem,
} from "@/lib/integrations/adsterra";

/** Shared by the lazy dictionary lookups below — just needs the network's Adsterra API key, none
 * of the campaign-ownership checks createAdsterraCampaignAction does (these are read-only). */
async function resolveAdsterraApiKey(networkId: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { data: network, error: networkError } = await supabase
    .from("ad_networks")
    .select("id, provider")
    .eq("id", networkId)
    .maybeSingle();
  if (networkError || !network || network.provider !== "adsterra") throw new Error("Network Adsterra tidak ditemukan.");

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", { p_network_id: networkId });
  if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");
  return apiKey as string;
}

export async function getAdsterraRegionsAction(networkId: string, countryId: number): Promise<AdsterraDictItem[]> {
  const apiKey = await resolveAdsterraApiKey(networkId);
  return getAdsterraRegions(apiKey, countryId);
}

export async function getAdsterraCitiesAction(
  networkId: string,
  countryId: number,
  regionId: number
): Promise<AdsterraDictItem[]> {
  const apiKey = await resolveAdsterraApiKey(networkId);
  return getAdsterraCities(apiKey, countryId, regionId);
}

export async function getAdsterraCarriersAction(networkId: string, countryId: number): Promise<AdsterraDictItem[]> {
  const apiKey = await resolveAdsterraApiKey(networkId);
  return getAdsterraCarriers(apiKey, countryId);
}

export async function getAdsterraBrowserVersionsAction(networkId: string, browserId: number): Promise<AdsterraDictItem[]> {
  const apiKey = await resolveAdsterraApiKey(networkId);
  return getAdsterraBrowserVersions(apiKey, browserId);
}

export async function getAdsterraOsVersionsAction(networkId: string, osId: number): Promise<AdsterraDictItem[]> {
  const apiKey = await resolveAdsterraApiKey(networkId);
  return getAdsterraOperatingSystemVersions(apiKey, osId);
}

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
  input: {
    campaignId: number;
    landingUrl: string;
    images: File[];
    headline: string;
    brandname: string;
    ctaBrandname: string;
    frequencyCapping: number;
  }
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

    return { banners };
  } catch (err) {
    console.error("createTrafficStarsBannerAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat bikin banner.";
    throw new Error(message);
  }
}

export async function createTrafficFactoryCampaignAction(
  networkId: string,
  input: {
    name: string;
    advertiserAdType: number;
    mediaStorageTemplate: string;
    size: string;
    categoryIds: number[];
    countries: string[];
    deviceIds: number[];
    browserIds: number[];
    osIds: number[];
    languageIds: number[];
    carrierIds: number[];
    pricingModel: number;
    price: number;
    maxDailyBudget: number;
    totalBudgetLimit: number;
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
    dayPartingTimezone: string;
    dayParting: { day: number; hours: number[] }[];
  }
): Promise<{ id: number }> {
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
    if (network.provider !== "traffic_factory") throw new Error("Network ini bukan Traffic Factory.");

    if (!input.name.trim()) throw new Error("Nama campaign wajib diisi.");
    // Not `!input.advertiserAdType` — Traffic Factory's ad type ids can legitimately be 0.
    if (!Number.isFinite(input.advertiserAdType)) throw new Error("Pilih jenis iklan dulu.");
    if (!input.mediaStorageTemplate) throw new Error("Pilih format media dulu.");
    if (input.categoryIds.length === 0) throw new Error("Pilih minimal 1 kategori.");
    if (input.countries.length === 0) throw new Error("Pilih minimal 1 negara target.");
    if (!input.price || input.price <= 0) throw new Error("Harga/bid harus lebih dari 0.");

    const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
      p_network_id: networkId,
    });
    if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

    const sessionToken = await getTrafficFactorySessionToken(apiKey);

    const result = await createTrafficFactoryCampaign(sessionToken, {
      name: input.name.trim(),
      advertiserAdType: input.advertiserAdType,
      mediaStorageTemplate: input.mediaStorageTemplate,
      size: input.size || undefined,
      categoryIds: input.categoryIds,
      countries: input.countries,
      pricingModel: input.pricingModel,
      price: input.price,
      maxDailyBudget: input.maxDailyBudget || undefined,
      totalBudgetLimit: input.totalBudgetLimit || undefined,
      deviceIds: input.deviceIds.length > 0 ? input.deviceIds : undefined,
      browserIds: input.browserIds.length > 0 ? input.browserIds : undefined,
      osIds: input.osIds.length > 0 ? input.osIds : undefined,
      languageIds: input.languageIds.length > 0 ? input.languageIds : undefined,
      carrierIds: input.carrierIds.length > 0 ? input.carrierIds : undefined,
      dayParting:
        input.dayParting.length > 0
          ? { timezone: input.dayPartingTimezone || "UTC", parting: input.dayParting }
          : undefined,
      startDate: input.startDate || undefined,
      endDate: input.endDate || undefined,
      totalImpressions: input.totalImpressions || undefined,
      maxDailyImpressions: input.maxDailyImpressions || undefined,
      frequencyCapping: input.frequencyCappingEnabled
        ? {
            enabled: true,
            impressions: input.frequencyCappingImpressions || undefined,
            minutes: input.frequencyCappingMinutes || undefined,
          }
        : undefined,
      sites:
        input.sites.length > 0
          ? { targeted: input.sitesMode === "targeted" ? input.sites : [], blocked: input.sitesMode === "blocked" ? input.sites : [] }
          : undefined,
      keywords:
        input.keywords.length > 0
          ? {
              targeted: input.keywordsMode === "targeted" ? input.keywords : [],
              blocked: input.keywordsMode === "blocked" ? input.keywords : [],
            }
          : undefined,
      ipRanges:
        input.ipRanges.length > 0
          ? {
              targeted: input.ipRangesMode === "targeted" ? input.ipRanges : [],
              blocked: input.ipRangesMode === "blocked" ? input.ipRanges : [],
            }
          : undefined,
    });

    const { error: insertError } = await supabase.from("campaigns").insert({
      workspace_id: network.workspace_id,
      network_id: network.id,
      external_id: String(result.id),
      name: input.name.trim(),
      status: "Draft",
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

    return result;
  } catch (err) {
    console.error("createTrafficFactoryCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat bikin campaign.";
    throw new Error(message);
  }
}

export async function createTrafficFactoryVariationAction(
  networkId: string,
  input: {
    campaignId: number;
    advertiserAdType: number;
    durl: string;
    images: File[];
  }
): Promise<{ created: number }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

    if (!input.durl.trim() || !/^https?:\/\//i.test(input.durl.trim())) {
      throw new Error("Landing URL wajib diisi, diawali http:// atau https://");
    }
    const validImages = input.images.filter((f) => f && f.size > 0);
    if (validImages.length === 0) throw new Error("Pilih minimal 1 gambar.");

    const { data: network, error: networkError } = await supabase
      .from("ad_networks")
      .select("id, provider")
      .eq("id", networkId)
      .maybeSingle();
    if (networkError || !network || network.provider !== "traffic_factory") throw new Error("Network tidak ditemukan.");

    const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", {
      p_network_id: networkId,
    });
    if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

    const sessionToken = await getTrafficFactorySessionToken(apiKey);
    const libraryUrl = await uploadTrafficFactoryLibraryUrl(sessionToken, input.durl.trim());

    let created = 0;
    for (const file of validImages) {
      const libraryFile = await uploadTrafficFactoryLibraryFile(sessionToken, file, {
        advertiserAdTypeId: input.advertiserAdType,
      });
      await createTrafficFactoryVariation(sessionToken, input.campaignId, {
        idLibraryFile: libraryFile.id,
        idLibraryUrl: libraryUrl.id,
      });
      created += 1;
    }

    revalidatePath(`/dashboard/campaigns/${input.campaignId}/edit`);
    return { created };
  } catch (err) {
    console.error("createTrafficFactoryVariationAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat upload creative.";
    throw new Error(message);
  }
}

export async function createAdsterraCampaignAction(
  networkId: string,
  input: {
    name: string;
    deviceFormat: ("desktop" | "mobile" | "tablet")[];
    trafficType: "All" | "Adult" | "Mainstream";
    connectionType: "All" | "3G" | "Wi-Fi";
    landingUrl: string;
    landingPreviews: string[];
    bids: { countryId: number; price: number }[];
    startOption: 1 | 2 | 3;
    date: string;
    time: string;
    totalBudgetLimit: number;
    dailyBudgetLimit: number;
    hourlyBudgetLimit: number;
    totalImpressionsLimit: number;
    dailyImpressionsLimit: number;
    hourlyImpressionsLimit: number;
    frequencyCappingAmount: number;
    frequencyCappingPeriod: number;
    frequencyCappingPeriodType: 1 | 2 | 0;
    isSmartCpm: boolean;
    isEvenlyDistributed: boolean;
    languageInclude: boolean;
    languageIds: number[];
    dayOfWeekInclude: boolean;
    days: number[];
    timeRanges: { include: boolean; from: number; to: number }[];
    ipList: string[];
    cpaGoal: { conditionValue: number; conditionOperator: number; optimizationParameter: number; gross: number } | null;
    browserTargets: { browser: number; rule: number; version: number; include: boolean }[];
    osTargets: { os: number; rule: number; version: number; include: boolean }[];
    locationTargets: { countryId: number; regionId: number; cityId: number; include: boolean }[];
    carrierTargets: { include: boolean; country: number; carriers: { id: number; name: string }[] }[];
  }
): Promise<{ campaignRequestId: string }> {
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
    if (network.provider !== "adsterra") throw new Error("Network ini bukan Adsterra.");

    if (!input.name.trim()) throw new Error("Nama campaign wajib diisi.");
    if (input.deviceFormat.length === 0) throw new Error("Pilih minimal 1 device target.");
    if (!input.landingUrl.trim() || !/^https?:\/\//i.test(input.landingUrl.trim())) {
      throw new Error("Landing URL wajib diisi, diawali http:// atau https://");
    }
    if (input.bids.length === 0) throw new Error("Pilih minimal 1 negara & harga bid.");
    if (input.bids.some((b) => !b.price || b.price <= 0)) throw new Error("Harga bid tiap negara harus lebih dari 0.");
    if (input.startOption === 2 && (!input.date || !input.time)) {
      throw new Error("Tanggal & jam mulai wajib diisi kalau pilih Jadwal.");
    }

    const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", { p_network_id: networkId });
    if (keyError || !apiKey) throw new Error(keyError?.message ?? "API key belum tersimpan.");

    const body: CreateAdsterraCampaignInput = {
      name: input.name.trim(),
      deviceFormat: input.deviceFormat,
      trafficType: input.trafficType,
      connectionType: input.connectionType,
      landingUrl: input.landingUrl.trim(),
      landingPreviews: input.landingPreviews.length > 0 ? input.landingPreviews : undefined,
      bids: input.bids,
      startOption: input.startOption,
      date: input.startOption === 2 ? input.date : undefined,
      time: input.startOption === 2 ? input.time : undefined,
      totalBudgetLimit: input.totalBudgetLimit || undefined,
      dailyBudgetLimit: input.dailyBudgetLimit || undefined,
      hourlyBudgetLimit: input.hourlyBudgetLimit || undefined,
      totalImpressionsLimit: input.totalImpressionsLimit || undefined,
      dailyImpressionsLimit: input.dailyImpressionsLimit || undefined,
      hourlyImpressionsLimit: input.hourlyImpressionsLimit || undefined,
      frequencyCappingAmount: input.frequencyCappingAmount || undefined,
      frequencyCappingPeriod: input.frequencyCappingPeriod || undefined,
      frequencyCappingPeriodType: input.frequencyCappingPeriodType || undefined,
      isSmartCpm: input.isSmartCpm || undefined,
      isEvenlyDistributed: input.isEvenlyDistributed || undefined,
      languageTargets: input.languageIds.length > 0 ? { include: input.languageInclude, languages: input.languageIds } : undefined,
      dayOfWeekTargets: input.days.length > 0 ? { include: input.dayOfWeekInclude, days: input.days } : undefined,
      timeRangeTargets: input.timeRanges.length > 0 ? input.timeRanges : undefined,
      ipList: input.ipList.length > 0 ? input.ipList : undefined,
      cpaGoal: input.cpaGoal ?? undefined,
      browserTargets: input.browserTargets.length > 0 ? input.browserTargets : undefined,
      osTargets: input.osTargets.length > 0 ? input.osTargets : undefined,
      locationTargets: input.locationTargets.length > 0 ? input.locationTargets : undefined,
      carrierTargets: input.carrierTargets.length > 0 ? input.carrierTargets : undefined,
    };

    const result = await createAdsterraCampaignRequest(apiKey, body);

    const { error: insertError } = await supabase.from("campaigns").insert({
      workspace_id: network.workspace_id,
      network_id: network.id,
      external_id: result.campaignRequestId,
      name: input.name.trim(),
      status: "Pending Review",
    });
    if (insertError) {
      console.error("Gagal simpan campaign request ke database:", insertError.message);
    }

    try {
      revalidatePath("/dashboard/networks");
      revalidatePath("/dashboard/campaigns");
      revalidatePath("/dashboard");
    } catch (revalidateErr) {
      console.error("revalidatePath gagal:", revalidateErr);
    }

    return result;
  } catch (err) {
    console.error("createAdsterraCampaignAction error:", err);
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga saat bikin campaign.";
    throw new Error(message);
  }
}
