import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getTrafficStarsAccessToken, getTrafficStarsCampaign, listTrafficStarsBanners } from "@/lib/integrations/trafficstars";
import { getTrafficFactorySessionToken, getTrafficFactoryCampaign } from "@/lib/integrations/trafficfactory";
import { TrafficStarsEditCampaignForm } from "@/components/dashboard/TrafficStarsEditCampaignForm";
import { TrafficStarsCampaignBanners } from "@/components/dashboard/TrafficStarsCampaignBanners";
import { TrafficFactoryEditCampaignForm } from "@/components/dashboard/TrafficFactoryEditCampaignForm";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, external_id, network_id")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) notFound();

  const backLink = (
    <Link href="/dashboard/campaigns" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft size={14} />
      Kembali ke Campaigns
    </Link>
  );

  const { data: network } = await supabase.from("ad_networks").select("id, name, provider").eq("id", campaign.network_id).maybeSingle();

  if (!network || !campaign.external_id || (network.provider !== "trafficstars" && network.provider !== "traffic_factory")) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted flex flex-col items-center gap-2">
          <AlertTriangle size={24} />
          <p className="font-medium text-foreground">Edit belum tersedia buat campaign ini</p>
          <p className="text-sm">Edit lewat dashboard baru jalan buat campaign TrafficStars & Traffic Factory sekarang.</p>
        </div>
      </div>
    );
  }

  const { data: apiKey, error: keyError } = await supabase.rpc("get_network_api_key", { p_network_id: network.id });
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
    let detail;
    try {
      const sessionToken = await getTrafficFactorySessionToken(apiKey);
      detail = await getTrafficFactoryCampaign(sessionToken, Number(campaign.external_id));
    } catch (err) {
      return (
        <div className="space-y-4">
          {backLink}
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger">
            Gagal ambil detail campaign: {err instanceof Error ? err.message : "error tak terduga"}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {backLink}
        <div>
          <h1 className="text-lg font-semibold">Edit Campaign — {network.name}</h1>
          <p className="text-sm text-muted">
            Perubahan langsung dikirim ke akun Traffic Factory kamu. Jenis iklan &amp; format media nggak bisa diubah setelah campaign
            dibuat.
          </p>
        </div>

        <TrafficFactoryEditCampaignForm campaignId={campaign.id} detail={detail} />
      </div>
    );
  }

  let detail;
  let banners;
  try {
    const accessToken = await getTrafficStarsAccessToken(apiKey);
    [detail, banners] = await Promise.all([
      getTrafficStarsCampaign(accessToken, Number(campaign.external_id)),
      listTrafficStarsBanners(accessToken, Number(campaign.external_id)),
    ]);
  } catch (err) {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-10 text-center text-danger">
          Gagal ambil detail campaign: {err instanceof Error ? err.message : "error tak terduga"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {backLink}
      <div>
        <h1 className="text-lg font-semibold">Edit Campaign — {network.name}</h1>
        <p className="text-sm text-muted">
          Perubahan langsung dikirim ke akun TrafficStars kamu. Format iklan &amp; jenis iklan nggak bisa diubah setelah campaign dibuat.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <TrafficStarsEditCampaignForm campaignId={campaign.id} detail={detail} />
        <TrafficStarsCampaignBanners campaignId={campaign.id} initialBanners={banners} />
      </div>
    </div>
  );
}
