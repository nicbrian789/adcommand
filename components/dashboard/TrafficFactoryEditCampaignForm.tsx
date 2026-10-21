"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { updateTrafficFactoryCampaignAction } from "@/app/dashboard/campaigns/[id]/edit/actions";
import { MultiSelectChecklist } from "@/components/dashboard/MultiSelectChecklist";
import { DayPartingGrid, type DayPartingValue } from "@/components/dashboard/DayPartingGrid";
import type { TrafficFactoryCampaignDetail, TrafficFactoryCategory, TrafficFactoryDictItem } from "@/lib/integrations/trafficfactory";

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

const STATUS_OPTIONS = [
  { value: 1, label: "Running" },
  { value: 0, label: "Paused" },
  { value: -1, label: "Archived" },
];

function linesToList(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function dayPartingToValue(entries: { day: number; hours: number[] }[]): DayPartingValue {
  const value: DayPartingValue = {};
  for (const e of entries) value[e.day] = new Set(e.hours);
  return value;
}

function dayPartingToPayload(value: DayPartingValue) {
  return Object.entries(value)
    .filter(([, hours]) => hours.size > 0)
    .map(([day, hours]) => ({ day: Number(day), hours: [...hours].sort((a, b) => a - b) }));
}

export function TrafficFactoryEditCampaignForm({
  campaignId,
  detail,
  categories,
  devices,
  browsers,
  operatingSystems,
  languages,
  carriers,
  timezones,
}: {
  campaignId: string;
  detail: TrafficFactoryCampaignDetail;
  categories: TrafficFactoryCategory[];
  devices: TrafficFactoryDictItem[];
  browsers: TrafficFactoryDictItem[];
  operatingSystems: TrafficFactoryDictItem[];
  languages: TrafficFactoryDictItem[];
  carriers: TrafficFactoryDictItem[];
  timezones: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(detail.name ?? "");
  const [status, setStatus] = useState(detail.status);
  const [pricingModel, setPricingModel] = useState(detail.pricingModel ?? 2);
  const [price, setPrice] = useState(detail.price !== null ? String(detail.price) : "");
  const [maxDailyBudget, setMaxDailyBudget] = useState(detail.maxDailyBudget ? String(detail.maxDailyBudget) : "");
  const [totalBudgetLimit, setTotalBudgetLimit] = useState(detail.totalBudgetLimit ? String(detail.totalBudgetLimit) : "");
  const [countries, setCountries] = useState(detail.countries.join(", "));
  const [categoryIds, setCategoryIds] = useState<Set<number>>(new Set(detail.categoryIds));
  const [deviceIds, setDeviceIds] = useState<Set<number>>(new Set(detail.deviceIds));
  const [browserIds, setBrowserIds] = useState<Set<number>>(new Set(detail.browserIds));
  const [osIds, setOsIds] = useState<Set<number>>(new Set(detail.osIds));
  const [languageIds, setLanguageIds] = useState<Set<number>>(new Set(detail.languageIds));
  const [carrierIds, setCarrierIds] = useState<Set<number>>(new Set(detail.carrierIds));
  const [dayPartingTimezone, setDayPartingTimezone] = useState(
    detail.dayPartingTimezone ?? (timezones.includes("UTC") ? "UTC" : (timezones[0] ?? ""))
  );
  const [dayParting, setDayParting] = useState<DayPartingValue>(dayPartingToValue(detail.dayParting));
  const [startDate, setStartDate] = useState(detail.startDate ?? "");
  const [endDate, setEndDate] = useState(detail.endDate ?? "");
  const [totalImpressions, setTotalImpressions] = useState(detail.totalImpressions ? String(detail.totalImpressions) : "");
  const [maxDailyImpressions, setMaxDailyImpressions] = useState(detail.maxDailyImpressions ? String(detail.maxDailyImpressions) : "");
  const [freqEnabled, setFreqEnabled] = useState((detail.frequencyCappingImpressions ?? 0) > 0);
  const [freqImpressions, setFreqImpressions] = useState(
    detail.frequencyCappingImpressions ? String(detail.frequencyCappingImpressions) : ""
  );
  const [freqMinutes, setFreqMinutes] = useState(detail.frequencyCappingMinutes ? String(detail.frequencyCappingMinutes) : "");

  const [sitesMode, setSitesMode] = useState<"targeted" | "blocked">(detail.sites.blocked.length > 0 ? "blocked" : "targeted");
  const [sitesText, setSitesText] = useState((detail.sites.blocked.length > 0 ? detail.sites.blocked : detail.sites.targeted).join("\n"));
  const [keywordsMode, setKeywordsMode] = useState<"targeted" | "blocked">(detail.keywords.blocked.length > 0 ? "blocked" : "targeted");
  const [keywordsText, setKeywordsText] = useState(
    (detail.keywords.blocked.length > 0 ? detail.keywords.blocked : detail.keywords.targeted).join("\n")
  );
  const [ipRangesMode, setIpRangesMode] = useState<"targeted" | "blocked">(detail.ipRanges.blocked.length > 0 ? "blocked" : "targeted");
  const [ipRangesText, setIpRangesText] = useState(
    (detail.ipRanges.blocked.length > 0 ? detail.ipRanges.blocked : detail.ipRanges.targeted).join("\n")
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const countryList = countries
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (countryList.length === 0) {
      setError("Negara target wajib diisi minimal 1 — Traffic Factory nggak terima campaign tanpa negara.");
      return;
    }
    if (categoryIds.size === 0) {
      setError("Kategori wajib dipilih minimal 1 — Traffic Factory nggak terima campaign tanpa kategori.");
      return;
    }

    setLoading(true);
    try {
      await updateTrafficFactoryCampaignAction(campaignId, {
        name,
        status,
        pricingModel,
        price: Number(price),
        maxDailyBudget: maxDailyBudget ? Number(maxDailyBudget) : 0,
        totalBudgetLimit: totalBudgetLimit ? Number(totalBudgetLimit) : 0,
        countries: countryList,
        categoryIds: [...categoryIds],
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
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update campaign.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 flex flex-col items-center text-center gap-2 max-w-lg">
        <CheckCircle2 className="text-success" size={28} />
        <p className="font-medium">Campaign berhasil diupdate</p>
        <button
          onClick={() => router.push("/dashboard/campaigns")}
          className="mt-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90"
        >
          Kembali ke Campaigns
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-5 max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1.5">Nama campaign</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(Number(e.target.value))} className={inputClass}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">Buat Running/Paused sehari-hari, pakai tombol Pause di halaman Campaigns.</p>
          </div>
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
            className={inputClass}
          />
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
          <input type="text" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="ID, US, SG" className={inputClass} />
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
          Negara dan kategori wajib minimal 1 — nggak bisa dikosongin (Traffic Factory nolak kalau dikosongin). Device/browser/OS/bahasa/carrier
          boleh dikosongin, artinya nggak ada filter (semua ditargetkan). Retargeting, zona premium, dan goal optimization belum ada di sini —
          atur manual lewat website Traffic Factory kalau perlu.
        </p>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Jadwal Jam Tayang (Day Parting)</h3>
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
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Block / Allow List</h3>
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
        Simpan Perubahan
      </button>
    </form>
  );
}
