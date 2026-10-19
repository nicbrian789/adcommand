"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Upload } from "lucide-react";
import { createTrafficFactoryCampaignAction, createTrafficFactoryVariationAction } from "@/app/dashboard/networks/[id]/create-campaign/actions";
import { FilePreviewThumbnails } from "@/components/dashboard/FilePreviewThumbnails";
import type { TrafficFactoryAdvertiserAdType, TrafficFactoryCategory } from "@/lib/integrations/trafficfactory";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const PRICING_MODELS = [
  { value: 1, label: "CPC" },
  { value: 2, label: "CPM" },
  { value: 3, label: "CPA" },
  { value: 4, label: "Smart CPM" },
  { value: 5, label: "CPV" },
  { value: 7, label: "Smart CPC" },
  { value: 8, label: "Smart Bid" },
];

export function TrafficFactoryCreateCampaignForm({
  networkId,
  adTypes,
  categories,
}: {
  networkId: string;
  adTypes: TrafficFactoryAdvertiserAdType[];
  categories: TrafficFactoryCategory[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [advertiserAdType, setAdvertiserAdType] = useState<number>(adTypes[0]?.id ?? 0);
  const selectedAdType = adTypes.find((t) => t.id === advertiserAdType);
  const [mediaStorageTemplate, setMediaStorageTemplate] = useState<string>(selectedAdType?.mediaStorageTemplates[0] ?? "");
  const [size, setSize] = useState<string>(selectedAdType?.sizes[0] ?? "");
  const [categoryIds, setCategoryIds] = useState<Set<number>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("");
  const [countries, setCountries] = useState("");
  const [pricingModel, setPricingModel] = useState(2);
  const [price, setPrice] = useState("");
  const [maxDailyBudget, setMaxDailyBudget] = useState("");
  const [totalBudgetLimit, setTotalBudgetLimit] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number } | null>(null);

  const [durl, setDurl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [variationLoading, setVariationLoading] = useState(false);
  const [variationError, setVariationError] = useState<string | null>(null);
  const [variationDone, setVariationDone] = useState<{ created: number } | null>(null);

  const filteredCategories = useMemo(() => {
    const q = categoryFilter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.longName.toLowerCase().includes(q));
  }, [categories, categoryFilter]);

  function changeAdType(id: number) {
    setAdvertiserAdType(id);
    const t = adTypes.find((x) => x.id === id);
    setMediaStorageTemplate(t?.mediaStorageTemplates[0] ?? "");
    setSize(t?.sizes[0] ?? "");
  }

  function toggleCategory(id: number) {
    setCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allFilteredSelected = filteredCategories.length > 0 && filteredCategories.every((c) => categoryIds.has(c.id));

  function toggleAllFiltered() {
    setCategoryIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const c of filteredCategories) next.delete(c.id);
      } else {
        for (const c of filteredCategories) next.add(c.id);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createTrafficFactoryCampaignAction(networkId, {
        name,
        advertiserAdType,
        mediaStorageTemplate,
        size,
        categoryIds: [...categoryIds],
        countries: countries
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean),
        pricingModel,
        price: Number(price),
        maxDailyBudget: maxDailyBudget ? Number(maxDailyBudget) : 0,
        totalBudgetLimit: totalBudgetLimit ? Number(totalBudgetLimit) : 0,
      });
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal bikin campaign.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVariationSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!success) return;
    setVariationLoading(true);
    setVariationError(null);
    try {
      const result = await createTrafficFactoryVariationAction(networkId, {
        campaignId: success.id,
        advertiserAdType,
        durl,
        images,
      });
      setVariationDone(result);
    } catch (err) {
      setVariationError(err instanceof Error ? err.message : "Gagal upload creative.");
    } finally {
      setVariationLoading(false);
    }
  }

  if (success && variationDone) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 flex flex-col items-center text-center gap-2 max-w-lg">
        <CheckCircle2 className="text-success" size={28} />
        <p className="font-medium">Campaign & creative berhasil dibuat di Traffic Factory</p>
        <p className="text-sm text-muted">
          ID campaign: {success.id} · {variationDone.created} creative dibuat
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
          <p className="text-sm">Campaign dibuat (ID {success.id}). Lanjut isi landing URL &amp; upload gambar creative-nya.</p>
        </div>

        <form onSubmit={handleVariationSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">Landing URL</label>
            <input
              type="text"
              required
              value={durl}
              onChange={(e) => setDurl(e.target.value)}
              placeholder="https://domain-kamu.com/offer"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-muted mb-1.5">
              Gambar — klik lagi buat nambah lebih dari 1, tiap gambar jadi 1 creative terpisah
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const picked = e.target.files ? Array.from(e.target.files) : [];
                setImages((prev) => [...prev, ...picked]);
                e.target.value = "";
              }}
              className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <p className="text-xs text-muted mt-1">
              Video belum didukung dari sini — upload video manual lewat website Traffic Factory kalau perlu.
            </p>
            <FilePreviewThumbnails files={images} onRemove={(i) => setImages((prev) => prev.filter((_, idx) => idx !== i))} />
          </div>

          {variationError ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger whitespace-pre-wrap">
              {variationError}
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={variationLoading}
              className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2.5 hover:bg-accent/90 disabled:opacity-60"
            >
              {variationLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload Creative
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/networks")}
              className="text-xs text-muted hover:text-foreground"
            >
              Lewati, isi nanti dari halaman Edit
            </button>
          </div>
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
        <label className="block text-xs text-muted mb-1.5">Jenis iklan</label>
        <select value={advertiserAdType} onChange={(e) => changeAdType(Number(e.target.value))} className={inputClass}>
          {adTypes.length === 0 ? <option value={0}>Tidak ada jenis iklan tersedia</option> : null}
          {adTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {(selectedAdType?.mediaStorageTemplates.length ?? 0) > 1 ? (
        <div>
          <label className="block text-xs text-muted mb-1.5">Format media</label>
          <select value={mediaStorageTemplate} onChange={(e) => setMediaStorageTemplate(e.target.value)} className={inputClass}>
            {selectedAdType!.mediaStorageTemplates.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {(selectedAdType?.sizes.length ?? 0) > 1 ? (
        <div>
          <label className="block text-xs text-muted mb-1.5">Ukuran</label>
          <select value={size} onChange={(e) => setSize(e.target.value)} className={inputClass}>
            {selectedAdType!.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1.5">Pricing model</label>
          <select value={pricingModel} onChange={(e) => setPricingModel(Number(e.target.value))} className={inputClass}>
            {PRICING_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1.5">Budget harian max, $ (opsional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={maxDailyBudget}
            onChange={(e) => setMaxDailyBudget(e.target.value)}
            placeholder="Kosongin kalau nggak dibatasi"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Budget total, $ (opsional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={totalBudgetLimit}
            onChange={(e) => setTotalBudgetLimit(e.target.value)}
            placeholder="Kosongin kalau nggak dibatasi"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Negara target, kode ISO 2 huruf pisah koma</label>
        <input
          type="text"
          required
          value={countries}
          onChange={(e) => setCountries(e.target.value)}
          placeholder="ID, US, SG"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">
          Kategori target {categoryIds.size > 0 ? `(${categoryIds.size} dipilih)` : null}
        </label>
        <input
          type="text"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          placeholder="Cari kategori..."
          className={`${inputClass} mb-2`}
        />
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border/60">
          {filteredCategories.length > 0 ? (
            <label className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-2 font-medium">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
              {allFilteredSelected ? "Hapus centang semua" : "Centang semua"}
              {categoryFilter ? ` (${filteredCategories.length} hasil cari)` : ` (${filteredCategories.length})`}
            </label>
          ) : null}
          {filteredCategories.length === 0 ? (
            <p className="text-xs text-muted px-3 py-2">Tidak ada kategori cocok.</p>
          ) : (
            filteredCategories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-2">
                <input type="checkbox" checked={categoryIds.has(c.id)} onChange={() => toggleCategory(c.id)} />
                {c.longName}
              </label>
            ))
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Targeting device/OS/browser/jadwal spesifik belum ada di sini — bisa diatur manual lewat website Traffic Factory kalau perlu.
      </p>

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
