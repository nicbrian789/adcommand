import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTrafficStarsAccessToken, getTrafficStarsAdFormats } from "@/lib/integrations/trafficstars";
import {
  getTrafficFactorySessionToken,
  getTrafficFactoryAdvertiserAdTypes,
  getTrafficFactoryCategories,
  getTrafficFactoryDevices,
  getTrafficFactoryBrowsers,
  getTrafficFactoryOperatingSystems,
  getTrafficFactoryLanguages,
  getTrafficFactoryCarriers,
  getTrafficFactoryTimezones,
} from "@/lib/integrations/trafficfactory";
import { TrafficStarsCreateCampaignForm } from "@/components/dashboard/TrafficStarsCreateCampaignForm";
import { TrafficFactoryCreateCampaignForm } from "@/components/dashboard/TrafficFactoryCreateCampaignForm";

export default async function CreateCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Supabase belum dikonfigurasi.</div>;
  }

  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">Sesi kamu sudah habis. Silakan masuk lagi.</div>;
  }

  const { data: network } = await supabase
    .from("ad_networks")
    .select("id, name, provider")
    .eq("id", id)
    .maybeSingle();

  if (!network) notFound();

  const backLink = (
    <Link href="/dashboard/networks" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft size={14} />
      Kembali ke Networks
    </Link>
  );

  if (network.provider !== "trafficstars" && network.provider !== "traffic_factory") {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted flex flex-col items-center gap-2">
          <AlertTriangle size={24} />
          <p className="font-medium text-foreground">Belum tersedia buat {network.name}</p>
          <p className="text-sm">Create Campaign baru jalan buat TrafficStars & Traffic Factory sekarang.</p>
        </div>
      </div>
    );
  }

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", { p_network_id: id });
  if (keyError || !apiKey) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger">
          API key belum tersimpan buat network ini.
        </div>
      </div>
    );
  }

  if (network.provider === "traffic_factory") {
    let adTypes, categories, devices, browsers, operatingSystems, languages, carriers, timezones;
    try {
      const sessionToken = await getTrafficFactorySessionToken(apiKey);
      [adTypes, categories, devices, browsers, operatingSystems, languages, carriers, timezones] = await Promise.all([
        getTrafficFactoryAdvertiserAdTypes(sessionToken),
        getTrafficFactoryCategories(sessionToken),
        getTrafficFactoryDevices(sessionToken),
        getTrafficFactoryBrowsers(sessionToken),
        getTrafficFactoryOperatingSystems(sessionToken),
        getTrafficFactoryLanguages(sessionToken),
        getTrafficFactoryCarriers(sessionToken),
        getTrafficFactoryTimezones(sessionToken),
      ]);
    } catch (err) {
      return (
        <div className="space-y-4">
          {backLink}
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger">
            Gagal ambil daftar jenis iklan/kategori: {err instanceof Error ? err.message : "error tak terduga"}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {backLink}
        <div>
          <h1 className="text-lg font-semibold">Buat Campaign Baru — {network.name}</h1>
          <p className="text-sm text-muted">
            Campaign bakal langsung kebuat di akun Traffic Factory kamu dengan status Draft. Creative (variation) ditambahin manual lewat
            website Traffic Factory dulu sebelum campaign bisa jalan.
          </p>
        </div>

        <TrafficFactoryCreateCampaignForm
          networkId={network.id}
          adTypes={adTypes}
          categories={categories}
          devices={devices}
          browsers={browsers}
          operatingSystems={operatingSystems}
          languages={languages}
          carriers={carriers}
          timezones={timezones}
        />
      </div>
    );
  }

  let formats;
  try {
    const accessToken = await getTrafficStarsAccessToken(apiKey);
    formats = await getTrafficStarsAdFormats(accessToken);
  } catch (err) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger">
          Gagal ambil daftar format iklan: {err instanceof Error ? err.message : "error tak terduga"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {backLink}
      <div>
        <h1 className="text-lg font-semibold">Buat Campaign Baru — {network.name}</h1>
        <p className="text-sm text-muted">
          Campaign bakal langsung kebuat di akun TrafficStars kamu, status awalnya nunggu review/approval dari TrafficStars.
        </p>
      </div>

      <TrafficStarsCreateCampaignForm networkId={network.id} formats={formats} />
    </div>
  );
}
