"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Upload } from "lucide-react";
import { createTrafficFactoryCampaignAction, createTrafficFactoryVariationAction } from "@/app/dashboard/networks/[id]/create-campaign/actions";
import { FilePreviewThumbnails } from "@/components/dashboard/FilePreviewThumbnails";
import { MultiSelectChecklist } from "@/components/dashboard/MultiSelectChecklist";
import { DayPartingGrid, type DayPartingValue } from "@/components/dashboard/DayPartingGrid";
import type { TrafficFactoryAdvertiserAdType, TrafficFactoryCategory, TrafficFactoryDictItem } from "@/lib/integrations/trafficfactory";

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

function linesToList(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function dayPartingToPayload(value: DayPartingValue) {
  return Object.entries(value)
    .filter(([, hours]) => hours.size > 0)
    .map(([day, hours]) => ({ day: Number(day), hours: [...hours].sort((a, b) => a - b) }));
}

export function TrafficFactoryCreateCampaignForm({
  networkId,
  adTypes,
  categories,
  devices,
  browsers,
  operatingSystems,
  languages,
  carriers,
  timezones,
}: {
  networkId: string;
  adTypes: TrafficFactoryAdvertiserAdType[];
  categories: TrafficFactoryCategory[];
  devices: TrafficFactoryDictItem[];
  browsers: TrafficFactoryDictItem[];
  operatingSystems: TrafficFactoryDictItem[];
  languages: TrafficFactoryDictItem[];
  carriers: TrafficFactoryDictItem[];
  timezones: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [advertiserAdType, setAdvertiserAdType] = useState<number>(adTypes[0]?.id ?? 0);
  const selectedAdType = adTypes.find((t) => t.id === advertiserAdType);
  const [mediaStorageTemplate, setMediaStorageTemplate] = useState<string>(selectedAdType?.mediaStorageTemplates[0] ?? "");
  const [size, setSize] = useState<string>(selectedAdType?.sizes[0] ?? "");
  const [categoryIds, setCategoryIds] = useState<Set<number>>(new Set());
  const [countries, setCountries] = useState("");
  const [pricingModel, setPricingModel] = useState(2);
  const [price, setPrice] = useState("");
  const [maxDailyBudget, setMaxDailyBudget] = useState("");
  const [totalBudgetLimit, setTotalBudgetLimit] = useState("");

  const [deviceIds, setDeviceIds] = useState<Set<number>>(new Set());
  const [browserIds, setBrowserIds] = useState<Set<number>>(new Set());
  const [osIds, setOsIds] = useState<Set<number>>(new Set());
  const [languageIds, setLanguageIds] = useState<Set<number>>(new Set());
  const [carrierIds, setCarrierIds] = useState<Set<number>>(new Set());
  const [dayPartingTimezone, setDayPartingTimezone] = useState(timezones.includes("UTC") ? "UTC" : (timezones[0] ?? ""));
  const [dayParting, setDayParting] = useState<DayPartingValue>({});
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalImpressions, setTotalImpressions] = useState("");
  const [maxDailyImpressions, setMaxDailyImpressions] = useState("");
  const [freqEnabled, setFreqEnabled] = useState(false);
  const [freqImpressions, setFreqImpressions] = useState("");
  const [freqMinutes, setFreqMinutes] = useState("");
  const [sitesMode, setSitesMode] = useState<"targeted" | "blocked">("blocked");
  const [sitesText, setSitesText] = useState("");
  const [keywordsMode, setKeywordsMode] = useState<"targeted" | "blocked">("blocked");
  const [keywordsText, setKeywordsText] = useState("");
  const [ipRangesMode, setIpRangesMode] = useState<"targeted" | "blocked">("blocked");
  const [ipRangesText, setIpRangesText] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: number } | null>(null);

  const [durl, setDurl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [variationLoading, setVariationLoading] = useState(false);
  const [variationError, setVariationError] = useState<string | null>(null);
  const [variationDone, setVariationDone] = useState<{ created: number } | null>(null);

  function changeAdType(id: number) {
    setAdvertiserAdType(id);
    const t = adTypes.find((x) => x.id === id);
    setMediaStorageTemplate(t?.mediaStorageTemplates[0] ?? "");
    setSize(t?.sizes[0] ?? "");
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
        deviceIds: [...deviceIds],
        browserIds: [...browserIds],
        osIds: [...osIds],
        languageIds: [...languageIds],
        carrierIds: [...carrierIds],
        dayPartingTimezone,
        dayParting: dayPartingToPayload(dayParting),
        startDate,
        endDate,
        totalImpressions: totalImpressions ? Number(totalImpressions) : 0,
        maxDailyImpressions: maxDailyImpressions ? Number(maxDailyImpressions) : 0,
        frequencyCappingEnabled: freqEnabled,
        frequencyCappingImpressions: freqEnabled && freqImpressions ? Number(freqImpressions) : 0,
        frequencyCappingMinutes: freqEnabled && freqMinutes ? Number(freqMinutes) : 0,
        sitesMode,
        sites: linesToList(sitesText),
        keywordsMode,
        keywords: linesToList(keywordsText),
        ipRangesMode,
        ipRanges: linesToList(ipRangesText),
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

          {size || (selectedAdType?.aspectRatios.length ?? 0) > 0 ? (
            <div className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 text-xs text-muted">
              <p>Ukuran dipilih: {size || "-"}</p>
              {selectedAdType!.aspectRatios.length > 0 ? (
                <p className="mt-0.5">
                  Dimensi gambar yang diterima: {selectedAdType!.aspectRatios.map((ar) => ar.tag || `${ar.minWidth}-${ar.maxWidth} x ${ar.minHeight}-${ar.maxHeight}px`).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

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
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-5 max-w-lg">
      <div className="space-y-4">
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
      </div>

      <div className="border-t border-border/60 pt-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Budget &amp; Limit</h3>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Total impression limit (opsional)</label>
            <input
              type="number"
              min="0"
              value={totalImpressions}
              onChange={(e) => setTotalImpressions(e.target.value)}
              placeholder="Kosongin kalau nggak dibatasi"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Max impression harian (opsional)</label>
            <input
              type="number"
              min="0"
              value={maxDailyImpressions}
              onChange={(e) => setMaxDailyImpressions(e.target.value)}
              placeholder="Kosongin kalau nggak dibatasi"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Jadwal &amp; Frequency Cap</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Mulai tanggal (opsional)</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Berakhir tanggal (opsional)</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={freqEnabled} onChange={(e) => setFreqEnabled(e.target.checked)} />
          Batasi berapa kali iklan tayang ke 1 user
        </label>
        {freqEnabled ? (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="1"
              value={freqImpressions}
              onChange={(e) => setFreqImpressions(e.target.value)}
              placeholder="Jumlah tayang"
              className={inputClass}
            />
            <input
              type="number"
              min="1"
              value={freqMinutes}
              onChange={(e) => setFreqMinutes(e.target.value)}
              placeholder="Per berapa menit"
              className={inputClass}
            />
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/60 pt-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Targeting</h3>
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
        <MultiSelectChecklist
          label="Kategori"
          items={categories.map((c) => ({ id: c.id, label: c.longName }))}
          selected={categoryIds}
          onChange={setCategoryIds}
          placeholder="Cari kategori..."
        />
        <MultiSelectChecklist
          label="Device"
          items={devices.map((d) => ({ id: d.id, label: d.name }))}
          selected={deviceIds}
          onChange={setDeviceIds}
          placeholder="Cari device..."
        />
        <MultiSelectChecklist
          label="Browser"
          items={browsers.map((b) => ({ id: b.id, label: b.name }))}
          selected={browserIds}
          onChange={setBrowserIds}
          placeholder="Cari browser..."
        />
        <MultiSelectChecklist
          label="Sistem operasi"
          items={operatingSystems.map((o) => ({ id: o.id, label: o.name }))}
          selected={osIds}
          onChange={setOsIds}
          placeholder="Cari OS..."
        />
        <MultiSelectChecklist
          label="Bahasa browser"
          items={languages.map((l) => ({ id: l.id, label: l.name }))}
          selected={languageIds}
          onChange={setLanguageIds}
          placeholder="Cari bahasa..."
        />
        <MultiSelectChecklist
          label="Carrier (operator seluler)"
          items={carriers.map((c) => ({ id: c.id, label: c.name }))}
          selected={carrierIds}
          onChange={setCarrierIds}
          placeholder="Cari carrier..."
        />
        <p className="text-xs text-muted">
          Kosongin kategori/device/browser/OS/bahasa/carrier berarti nggak ada filter (semua ditargetkan). Retargeting, zona premium,
          dan goal optimization belum ada di sini — bisa diatur manual lewat website Traffic Factory kalau perlu.
        </p>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Jadwal Jam Tayang (Day Parting, opsional)</h3>
        <div>
          <label className="block text-xs text-muted mb-1.5">Timezone</label>
          <select value={dayPartingTimezone} onChange={(e) => setDayPartingTimezone(e.target.value)} className={inputClass}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <DayPartingGrid value={dayParting} onChange={setDayParting} />
        <p className="text-xs text-muted">
          Urutan hari (Senin=1...Minggu=7) ini asumsi — Traffic Factory nggak dokumentasiin urutannya secara eksplisit. Kalau pas
          dicoba ternyata hari yang aktif kebalik, kabarin ya biar saya perbaiki.
        </p>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Block / Allow List (opsional)</h3>
        {([
          { key: "sites", label: "Website", mode: sitesMode, setMode: setSitesMode, text: sitesText, setText: setSitesText },
          { key: "keywords", label: "Keyword", mode: keywordsMode, setMode: setKeywordsMode, text: keywordsText, setText: setKeywordsText },
          { key: "ipRanges", label: "IP / IP range", mode: ipRangesMode, setMode: setIpRangesMode, text: ipRangesText, setText: setIpRangesText },
        ] as const).map((f) => (
          <div key={f.key}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">{f.label} (1 per baris)</label>
              <select
                value={f.mode}
                onChange={(e) => f.setMode(e.target.value as "targeted" | "blocked")}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-xs"
              >
                <option value="blocked">Blokir</option>
                <option value="targeted">Hanya izinkan</option>
              </select>
            </div>
            <textarea
              value={f.text}
              onChange={(e) => f.setText(e.target.value)}
              rows={2}
              placeholder="Kosongin kalau nggak ada"
              className={`${inputClass} resize-y`}
            />
          </div>
        ))}
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
