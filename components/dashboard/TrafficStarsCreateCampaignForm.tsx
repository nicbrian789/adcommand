"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { createTrafficStarsCampaignAction } from "@/app/dashboard/networks/[id]/create-campaign/actions";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number; status: string } | null>(null);

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
        countries: countries
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
      });
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal bikin campaign.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 flex flex-col items-center text-center gap-2">
        <CheckCircle2 className="text-success" size={28} />
        <p className="font-medium">Campaign berhasil dibuat di TrafficStars</p>
        <p className="text-sm text-muted">
          ID campaign: {success.id} · Status: {success.status}
        </p>
        <p className="text-xs text-muted mt-1">
          Materi iklan (gambar/video) belum ke-upload — lanjutin dari website TrafficStars langsung buat nambahin creative.
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
