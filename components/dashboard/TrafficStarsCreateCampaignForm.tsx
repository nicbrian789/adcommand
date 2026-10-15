"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Upload, ChevronDown } from "lucide-react";
import {
  createTrafficStarsCampaignAction,
  createTrafficStarsBannerAction,
} from "@/app/dashboard/networks/[id]/create-campaign/actions";
import type { TrafficStarsAdFormat } from "@/lib/integrations/trafficstars";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function TrafficStarsCreateCampaignForm({
  networkId,
  formats,
}: {
  networkId: string;
  formats: TrafficStarsAdFormat[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [formatId, setFormatId] = useState<number>(formats[0]?.id ?? 0);
  const selectedFormat = formats.find((f) => f.id === formatId);
  const [adType, setAdType] = useState<string>(selectedFormat?.ad_types[0]?.id ?? "");
  const [pricingModel, setPricingModel] = useState<"cpm" | "cpc" | "cpa">("cpm");
  const [price, setPrice] = useState("");
  const [maxDaily, setMaxDaily] = useState("");
  const [countries, setCountries] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [totalBudget, setTotalBudget] = useState("");
  const [trafficType, setTrafficType] = useState<"ron" | "prime" | "members_area">("ron");
  const [weight, setWeight] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number; status: string } | null>(null);

  const [landingUrl, setLandingUrl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [headline, setHeadline] = useState("");
  const [brandname, setBrandname] = useState("");
  const [ctaBrandname, setCtaBrandname] = useState("");
  const [frequencyCapping, setFrequencyCapping] = useState("");
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerDone, setBannerDone] = useState<{ banners: { id: number; uploaded: boolean }[] } | null>(null);

  function changeFormat(id: number) {
    setFormatId(id);
    const f = formats.find((x) => x.id === id);
    setAdType(f?.ad_types[0]?.id ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createTrafficStarsCampaignAction(networkId, {
        name,
        formatId,
        adType,
        pricingModel,
        price: Number(price),
        maxDaily: maxDaily ? Number(maxDaily) : 0,
        totalBudget: totalBudget ? Number(totalBudget) : 0,
        countries: countries
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
        trafficType,
        weight: weight ? Number(weight) : 0,
        scheduleStartDate,
      });
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal bikin campaign.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBannerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!success) return;
    setBannerLoading(true);
    setBannerError(null);

    try {
      const result = await createTrafficStarsBannerAction(networkId, {
        campaignId: success.id,
        landingUrl,
        images,
        headline,
        brandname,
        ctaBrandname,
        frequencyCapping: frequencyCapping ? Number(frequencyCapping) : 0,
      });
      setBannerDone(result);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Gagal bikin banner.");
    } finally {
      setBannerLoading(false);
    }
  }

  if (success && bannerDone) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 flex flex-col items-center text-center gap-2">
        <CheckCircle2 className="text-success" size={28} />
        <p className="font-medium">Campaign & banner berhasil dibuat di TrafficStars</p>
        <p className="text-sm text-muted">
          ID campaign: {success.id} · {bannerDone.banners.length} banner dibuat
          {" "}({bannerDone.banners.filter((b) => b.uploaded).length} ada gambar)
        </p>
        <p className="text-xs text-muted mt-1">
          Status awal: {success.status}, nunggu review/approval dari TrafficStars sebelum tayang.
        </p>
        <button
          onClick={() => router.push("/dashboard/networks")}
          className="mt-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90"
        >
          Kembali ke Networks
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 flex items-center gap-3">
          <CheckCircle2 className="text-success shrink-0" size={20} />
          <p className="text-sm">
            Campaign dibuat (ID {success.id}, status {success.status}). Lanjut isi landing URL & upload creative-nya.
          </p>
        </div>

        <form onSubmit={handleBannerSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Landing URL</label>
            <input
              type="text"
              required
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
              placeholder="https://domain-kamu.com/offer"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">
              Gambar/video banner — boleh pilih lebih dari 1 sekaligus buat rotasi/A-B test (opsional buat tes, wajib biar iklan bisa tayang)
            </label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => setImages(e.target.files ? Array.from(e.target.files) : [])}
              className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            {images.length > 0 ? (
              <p className="text-xs text-muted mt-1">{images.length} file dipilih — bakal jadi {images.length} banner terpisah.</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5">Headline (buat native)</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Opsional"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Brand name (buat native)</label>
              <input
                type="text"
                value={brandname}
                onChange={(e) => setBrandname(e.target.value)}
                placeholder="Opsional"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5">CTA brand name (wajib buat video)</label>
              <input
                type="text"
                value={ctaBrandname}
                onChange={(e) => setCtaBrandname(e.target.value)}
                placeholder="Opsional, kecuali video"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Frequency cap (maks tayang ke 1 orang)</label>
              <input
                type="number"
                min="0"
                value={frequencyCapping}
                onChange={(e) => setFrequencyCapping(e.target.value)}
                placeholder="Kosongin kalau nggak dibatasi"
                className={inputClass}
              />
            </div>
          </div>

          {bannerError ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger whitespace-pre-wrap">{bannerError}</div>
          ) : null}

          <button
            type="submit"
            disabled={bannerLoading}
            className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2.5 hover:bg-accent/90 disabled:opacity-60"
          >
            {bannerLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Buat Banner
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-4 max-w-lg">
      <div>
        <label className="block text-xs text-muted mb-1.5">Nama campaign</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Campaign ABC"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Format iklan</label>
        <select
          value={formatId}
          onChange={(e) => changeFormat(Number(e.target.value))}
          className={inputClass}
        >
          {formats.length === 0 ? <option value={0}>Tidak ada format tersedia</option> : null}
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.type})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Jenis iklan</label>
        <select value={adType} onChange={(e) => setAdType(e.target.value)} className={inputClass}>
          {(selectedFormat?.ad_types ?? []).length === 0 ? <option value="">Tidak ada pilihan</option> : null}
          {(selectedFormat?.ad_types ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1.5">Pricing model</label>
          <select value={pricingModel} onChange={(e) => setPricingModel(e.target.value as "cpm" | "cpc" | "cpa")} className={inputClass}>
            <option value="cpm">CPM</option>
            <option value="cpc">CPC</option>
            <option value="cpa">CPA</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Harga/bid ($)</label>
          <input
            type="number"
            required
            min="0.0001"
            step="0.0001"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.10"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Budget harian max, $ (opsional)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={maxDaily}
          onChange={(e) => setMaxDaily(e.target.value)}
          placeholder="Kosongin kalau nggak dibatasi"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Negara target, kode ISO 2 huruf pisah koma (opsional)</label>
        <input
          type="text"
          value={countries}
          onChange={(e) => setCountries(e.target.value)}
          placeholder="ID, US, SG (kosongin buat semua negara)"
          className={inputClass}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-accent"
      >
        <ChevronDown size={14} className={showAdvanced ? "rotate-180 transition-transform" : "transition-transform"} />
        Pengaturan lanjutan
      </button>

      {showAdvanced ? (
        <div className="space-y-4 rounded-lg border border-border/60 p-4 bg-surface-2/40">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5">Budget total, $ (opsional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                placeholder="Kosongin kalau nggak dibatasi"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Weight/prioritas (opsional)</label>
              <input
                type="number"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Default"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5">Tipe traffic</label>
              <select
                value={trafficType}
                onChange={(e) => setTrafficType(e.target.value as "ron" | "prime" | "members_area")}
                className={inputClass}
              >
                <option value="ron">RON (semua traffic)</option>
                <option value="prime">Prime</option>
                <option value="members_area">Members Area</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Mulai tanggal (opsional)</label>
              <input
                type="date"
                value={scheduleStartDate}
                onChange={(e) => setScheduleStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-muted">
            Targeting device/OS/browser spesifik belum ada di sini — bisa diatur manual lewat website TrafficStars kalau perlu.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger whitespace-pre-wrap">{error}</div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2.5 hover:bg-accent/90 disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        Buat Campaign
      </button>
    </form>
  );
}
