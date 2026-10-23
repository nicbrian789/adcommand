"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  createAdsterraCampaignAction,
  getAdsterraBrowserVersionsAction,
  getAdsterraOsVersionsAction,
  getAdsterraRegionsAction,
  getAdsterraCitiesAction,
  getAdsterraCarriersAction,
} from "@/app/dashboard/networks/[id]/create-campaign/actions";
import { MultiSelectChecklist } from "@/components/dashboard/MultiSelectChecklist";
import { FilePreviewThumbnails } from "@/components/dashboard/FilePreviewThumbnails";
import type { AdsterraCountry, AdsterraDictItem, AdsterraBrowser } from "@/lib/integrations/adsterra";

const RULE_OPTIONS = [
  { value: 0, label: "Sama dengan (=)" },
  { value: 1, label: "Lebih besar (>)" },
  { value: 2, label: "Lebih besar sama dengan (>=)" },
  { value: 3, label: "Lebih kecil (<)" },
  { value: 4, label: "Lebih kecil sama dengan (<=)" },
];

type BrowserTarget = { browser: number; browserName: string; rule: number; version: number; versionName: string; include: boolean };
type OsTarget = { os: number; osName: string; rule: number; version: number; versionName: string; include: boolean };
type LocationTarget = {
  countryId: number;
  countryName: string;
  regionId: number;
  regionName: string;
  cityId: number;
  cityName: string;
  include: boolean;
};
type CarrierTargetGroup = { country: number; countryName: string; carriers: { id: number; name: string }[]; include: boolean };

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const DEVICE_FORMATS = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet" },
] as const;

const DAYS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 7, label: "Minggu" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type TimeRange = { include: boolean; from: string; to: string };

export function AdsterraCreateCampaignForm({
  networkId,
  countries,
  languages,
  browsers,
  operatingSystems,
}: {
  networkId: string;
  countries: AdsterraCountry[];
  languages: AdsterraDictItem[];
  browsers: AdsterraBrowser[];
  operatingSystems: AdsterraDictItem[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [deviceFormat, setDeviceFormat] = useState<Set<string>>(new Set(["desktop"]));
  const [trafficType, setTrafficType] = useState<"All" | "Adult" | "Mainstream">("All");
  const [connectionType, setConnectionType] = useState<"All" | "3G" | "Wi-Fi">("All");
  const [landingUrl, setLandingUrl] = useState("");
  const [previewImages, setPreviewImages] = useState<File[]>([]);

  const [bidCountryIds, setBidCountryIds] = useState<Set<number>>(new Set());
  const [bidPrices, setBidPrices] = useState<Record<number, string>>({});

  const [startOption, setStartOption] = useState<1 | 2 | 3>(1);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");

  const [totalBudgetLimit, setTotalBudgetLimit] = useState("");
  const [dailyBudgetLimit, setDailyBudgetLimit] = useState("");
  const [hourlyBudgetLimit, setHourlyBudgetLimit] = useState("");
  const [totalImpressionsLimit, setTotalImpressionsLimit] = useState("");
  const [dailyImpressionsLimit, setDailyImpressionsLimit] = useState("");
  const [hourlyImpressionsLimit, setHourlyImpressionsLimit] = useState("");

  const [freqEnabled, setFreqEnabled] = useState(false);
  const [freqAmount, setFreqAmount] = useState("");
  const [freqPeriod, setFreqPeriod] = useState("");
  const [freqPeriodType, setFreqPeriodType] = useState<1 | 2>(2);

  const [isSmartCpm, setIsSmartCpm] = useState(false);
  const [isEvenlyDistributed, setIsEvenlyDistributed] = useState(false);

  const [languageInclude, setLanguageInclude] = useState(true);
  const [languageIds, setLanguageIds] = useState<Set<number>>(new Set());

  const [dayOfWeekInclude, setDayOfWeekInclude] = useState(true);
  const [days, setDays] = useState<Set<number>>(new Set());

  const [timeRanges, setTimeRanges] = useState<TimeRange[]>([]);

  const [ipListText, setIpListText] = useState("");

  const [cpaEnabled, setCpaEnabled] = useState(false);
  const [cpaConditionValue, setCpaConditionValue] = useState("");
  const [cpaConditionOperator, setCpaConditionOperator] = useState(1);
  const [cpaOptimizationParameter, setCpaOptimizationParameter] = useState(1);
  const [cpaGross, setCpaGross] = useState("");

  const [browserTargets, setBrowserTargets] = useState<BrowserTarget[]>([]);
  const [browserDraftId, setBrowserDraftId] = useState<number | "">("");
  const [browserDraftVersions, setBrowserDraftVersions] = useState<AdsterraDictItem[]>([]);
  const [browserDraftVersionId, setBrowserDraftVersionId] = useState<number | "">("");
  const [browserDraftRule, setBrowserDraftRule] = useState(0);
  const [browserDraftInclude, setBrowserDraftInclude] = useState(true);
  const [browserVersionsLoading, setBrowserVersionsLoading] = useState(false);

  const [osTargets, setOsTargets] = useState<OsTarget[]>([]);
  const [osDraftId, setOsDraftId] = useState<number | "">("");
  const [osDraftVersions, setOsDraftVersions] = useState<AdsterraDictItem[]>([]);
  const [osDraftVersionId, setOsDraftVersionId] = useState<number | "">("");
  const [osDraftRule, setOsDraftRule] = useState(0);
  const [osDraftInclude, setOsDraftInclude] = useState(true);
  const [osVersionsLoading, setOsVersionsLoading] = useState(false);

  const [locationTargets, setLocationTargets] = useState<LocationTarget[]>([]);
  const [locationDraftCountryId, setLocationDraftCountryId] = useState<number | "">("");
  const [locationDraftRegions, setLocationDraftRegions] = useState<AdsterraDictItem[]>([]);
  const [locationDraftRegionId, setLocationDraftRegionId] = useState<number | "">("");
  const [locationDraftCities, setLocationDraftCities] = useState<AdsterraDictItem[]>([]);
  const [locationDraftCityId, setLocationDraftCityId] = useState(0);
  const [locationDraftInclude, setLocationDraftInclude] = useState(true);
  const [locationRegionsLoading, setLocationRegionsLoading] = useState(false);
  const [locationCitiesLoading, setLocationCitiesLoading] = useState(false);

  const [carrierTargetGroups, setCarrierTargetGroups] = useState<CarrierTargetGroup[]>([]);
  const [carrierDraftCountryId, setCarrierDraftCountryId] = useState<number | "">("");
  const [carrierDraftOptions, setCarrierDraftOptions] = useState<AdsterraDictItem[]>([]);
  const [carrierDraftSelected, setCarrierDraftSelected] = useState<Set<number>>(new Set());
  const [carrierDraftInclude, setCarrierDraftInclude] = useState(true);
  const [carrierOptionsLoading, setCarrierOptionsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ campaignRequestId: string } | null>(null);

  function toggleDeviceFormat(value: string) {
    setDeviceFormat((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleDay(value: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function addTimeRange() {
    setTimeRanges((prev) => [...prev, { include: true, from: "9", to: "17" }]);
  }

  function updateTimeRange(index: number, patch: Partial<TimeRange>) {
    setTimeRanges((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeTimeRange(index: number) {
    setTimeRanges((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleBrowserSelect(idText: string) {
    const id = idText ? Number(idText) : "";
    setBrowserDraftId(id);
    setBrowserDraftVersionId("");
    setBrowserDraftVersions([]);
    if (id === "") return;
    setBrowserVersionsLoading(true);
    try {
      const versions = await getAdsterraBrowserVersionsAction(networkId, id);
      setBrowserDraftVersions(versions);
      if (versions.length > 0) setBrowserDraftVersionId(versions[0].id);
    } catch {
      // keep the draft usable even if the version list fails to load — user can retry by reselecting
    } finally {
      setBrowserVersionsLoading(false);
    }
  }

  function addBrowserTarget() {
    if (browserDraftId === "" || browserDraftVersionId === "") return;
    const browser = browsers.find((b) => b.id === browserDraftId);
    const version = browserDraftVersions.find((v) => v.id === browserDraftVersionId);
    if (!browser || !version) return;
    setBrowserTargets((prev) => [
      ...prev,
      {
        browser: browser.id,
        browserName: browser.name,
        rule: browserDraftRule,
        version: version.id,
        versionName: version.name,
        include: browserDraftInclude,
      },
    ]);
    setBrowserDraftId("");
    setBrowserDraftVersionId("");
    setBrowserDraftVersions([]);
  }

  function removeBrowserTarget(index: number) {
    setBrowserTargets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleOsSelect(idText: string) {
    const id = idText ? Number(idText) : "";
    setOsDraftId(id);
    setOsDraftVersionId("");
    setOsDraftVersions([]);
    if (id === "") return;
    setOsVersionsLoading(true);
    try {
      const versions = await getAdsterraOsVersionsAction(networkId, id);
      setOsDraftVersions(versions);
      if (versions.length > 0) setOsDraftVersionId(versions[0].id);
    } catch {
      // keep the draft usable even if the version list fails to load
    } finally {
      setOsVersionsLoading(false);
    }
  }

  function addOsTarget() {
    if (osDraftId === "" || osDraftVersionId === "") return;
    const os = operatingSystems.find((o) => o.id === osDraftId);
    const version = osDraftVersions.find((v) => v.id === osDraftVersionId);
    if (!os || !version) return;
    setOsTargets((prev) => [
      ...prev,
      { os: os.id, osName: os.name, rule: osDraftRule, version: version.id, versionName: version.name, include: osDraftInclude },
    ]);
    setOsDraftId("");
    setOsDraftVersionId("");
    setOsDraftVersions([]);
  }

  function removeOsTarget(index: number) {
    setOsTargets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleLocationCountrySelect(idText: string) {
    const id = idText ? Number(idText) : "";
    setLocationDraftCountryId(id);
    setLocationDraftRegionId("");
    setLocationDraftRegions([]);
    setLocationDraftCities([]);
    setLocationDraftCityId(0);
    if (id === "") return;
    setLocationRegionsLoading(true);
    try {
      const regions = await getAdsterraRegionsAction(networkId, id);
      setLocationDraftRegions(regions);
    } catch {
      // keep the draft usable even if the region list fails to load
    } finally {
      setLocationRegionsLoading(false);
    }
  }

  async function handleLocationRegionSelect(idText: string) {
    const id = idText ? Number(idText) : "";
    setLocationDraftRegionId(id);
    setLocationDraftCities([]);
    setLocationDraftCityId(0);
    if (id === "" || locationDraftCountryId === "") return;
    setLocationCitiesLoading(true);
    try {
      const cities = await getAdsterraCitiesAction(networkId, locationDraftCountryId, id);
      setLocationDraftCities(cities);
    } catch {
      // keep the draft usable even if the city list fails to load
    } finally {
      setLocationCitiesLoading(false);
    }
  }

  function addLocationTarget() {
    if (locationDraftCountryId === "" || locationDraftRegionId === "") return;
    const country = countries.find((c) => c.id === locationDraftCountryId);
    const region = locationDraftRegions.find((r) => r.id === locationDraftRegionId);
    if (!country || !region) return;
    const city = locationDraftCities.find((c) => c.id === locationDraftCityId);
    setLocationTargets((prev) => [
      ...prev,
      {
        countryId: country.id,
        countryName: country.name,
        regionId: region.id,
        regionName: region.name,
        cityId: locationDraftCityId,
        cityName: locationDraftCityId === 0 ? "Seluruh region" : (city?.name ?? String(locationDraftCityId)),
        include: locationDraftInclude,
      },
    ]);
    setLocationDraftCountryId("");
    setLocationDraftRegionId("");
    setLocationDraftRegions([]);
    setLocationDraftCities([]);
    setLocationDraftCityId(0);
  }

  function removeLocationTarget(index: number) {
    setLocationTargets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCarrierCountrySelect(idText: string) {
    const id = idText ? Number(idText) : "";
    setCarrierDraftCountryId(id);
    setCarrierDraftOptions([]);
    setCarrierDraftSelected(new Set());
    if (id === "") return;
    setCarrierOptionsLoading(true);
    try {
      const carriers = await getAdsterraCarriersAction(networkId, id);
      setCarrierDraftOptions(carriers);
    } catch {
      // keep the draft usable even if the carrier list fails to load
    } finally {
      setCarrierOptionsLoading(false);
    }
  }

  function addCarrierGroup() {
    if (carrierDraftCountryId === "" || carrierDraftSelected.size === 0) return;
    const country = countries.find((c) => c.id === carrierDraftCountryId);
    if (!country) return;
    const carriers = carrierDraftOptions.filter((c) => carrierDraftSelected.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
    setCarrierTargetGroups((prev) => [
      ...prev,
      { country: country.id, countryName: country.name, carriers, include: carrierDraftInclude },
    ]);
    setCarrierDraftCountryId("");
    setCarrierDraftOptions([]);
    setCarrierDraftSelected(new Set());
  }

  function removeCarrierGroup(index: number) {
    setCarrierTargetGroups((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const landingPreviews = await Promise.all(previewImages.map(fileToBase64));

      const bids = [...bidCountryIds].map((countryId) => ({
        countryId,
        price: Number(bidPrices[countryId] ?? 0),
      }));

      const result = await createAdsterraCampaignAction(networkId, {
        name,
        deviceFormat: [...deviceFormat] as ("desktop" | "mobile" | "tablet")[],
        trafficType,
        connectionType,
        landingUrl,
        landingPreviews,
        bids,
        startOption,
        date: startDate,
        time: startTime,
        totalBudgetLimit: totalBudgetLimit ? Number(totalBudgetLimit) : 0,
        dailyBudgetLimit: dailyBudgetLimit ? Number(dailyBudgetLimit) : 0,
        hourlyBudgetLimit: hourlyBudgetLimit ? Number(hourlyBudgetLimit) : 0,
        totalImpressionsLimit: totalImpressionsLimit ? Number(totalImpressionsLimit) : 0,
        dailyImpressionsLimit: dailyImpressionsLimit ? Number(dailyImpressionsLimit) : 0,
        hourlyImpressionsLimit: hourlyImpressionsLimit ? Number(hourlyImpressionsLimit) : 0,
        frequencyCappingAmount: freqEnabled && freqAmount ? Number(freqAmount) : 0,
        frequencyCappingPeriod: freqEnabled && freqPeriod ? Number(freqPeriod) : 0,
        frequencyCappingPeriodType: freqEnabled ? freqPeriodType : 0,
        isSmartCpm,
        isEvenlyDistributed,
        languageInclude,
        languageIds: [...languageIds],
        dayOfWeekInclude,
        days: [...days],
        timeRanges: timeRanges
          .filter((r) => r.from !== "" && r.to !== "")
          .map((r) => ({ include: r.include, from: Number(r.from), to: Number(r.to) })),
        ipList: ipListText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        cpaGoal:
          cpaEnabled && cpaConditionValue && cpaGross
            ? {
                conditionValue: Number(cpaConditionValue),
                conditionOperator: cpaConditionOperator,
                optimizationParameter: cpaOptimizationParameter,
                gross: Number(cpaGross),
              }
            : null,
        browserTargets: browserTargets.map((t) => ({ browser: t.browser, rule: t.rule, version: t.version, include: t.include })),
        osTargets: osTargets.map((t) => ({ os: t.os, rule: t.rule, version: t.version, include: t.include })),
        locationTargets: locationTargets.map((t) => ({
          countryId: t.countryId,
          regionId: t.regionId,
          cityId: t.cityId,
          include: t.include,
        })),
        carrierTargets: carrierTargetGroups.map((g) => ({ include: g.include, country: g.country, carriers: g.carriers })),
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
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 flex flex-col items-center text-center gap-2 max-w-lg">
        <CheckCircle2 className="text-success" size={28} />
        <p className="font-medium">Campaign request berhasil dikirim ke Adsterra</p>
        <p className="text-sm text-muted">
          ID request: {success.campaignRequestId} — statusnya <strong>Pending Review</strong>, nunggu direview tim moderasi Adsterra
          (biasanya nggak lama). Cek status terbarunya lewat tombol &quot;Cek Status&quot; di halaman Campaigns.
        </p>
        <button
          onClick={() => router.push("/dashboard/campaigns")}
          className="mt-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90"
        >
          Ke halaman Campaigns
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-5 max-w-lg">
      <div className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 text-xs text-muted">
        Adsterra cuma support bikin campaign <strong>Popunder</strong> dengan pricing <strong>CPM</strong> lewat API saat ini — format
        lain (Social Bar, In-Page Push, Interstitial) belum bisa dari sini.
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1.5">Nama campaign</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Device target</label>
          <div className="flex gap-3">
            {DEVICE_FORMATS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={deviceFormat.has(d.value)} onChange={() => toggleDeviceFormat(d.value)} />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Tipe traffic</label>
            <select value={trafficType} onChange={(e) => setTrafficType(e.target.value as typeof trafficType)} className={inputClass}>
              <option value="All">All</option>
              <option value="Adult">Adult</option>
              <option value="Mainstream">Mainstream</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Tipe koneksi</label>
            <select
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value as typeof connectionType)}
              className={inputClass}
            >
              <option value="All">All</option>
              <option value="3G">3G</option>
              <option value="Wi-Fi">Wi-Fi</option>
            </select>
          </div>
        </div>

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
          <label className="block text-xs text-muted mb-1.5">Preview gambar landing (opsional)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const picked = e.target.files ? Array.from(e.target.files) : [];
              setPreviewImages((prev) => [...prev, ...picked]);
              e.target.value = "";
            }}
            className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />
          <FilePreviewThumbnails
            files={previewImages}
            onRemove={(i) => setPreviewImages((prev) => prev.filter((_, idx) => idx !== i))}
          />
        </div>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Negara &amp; Bid (CPM)</h3>
        <MultiSelectChecklist
          label="Negara target"
          items={countries.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
          selected={bidCountryIds}
          onChange={setBidCountryIds}
          placeholder="Cari negara..."
        />
        {bidCountryIds.size > 0 ? (
          <div className="space-y-1.5">
            {[...bidCountryIds].map((id) => {
              const c = countries.find((x) => x.id === id);
              return (
                <div key={id} className="flex items-center gap-2">
                  <span className="text-xs text-muted w-32 truncate">{c ? `${c.name} (${c.code})` : id}</span>
                  <input
                    type="number"
                    required
                    min="0.00001"
                    step="0.0001"
                    value={bidPrices[id] ?? ""}
                    onChange={(e) => setBidPrices((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder="Harga CPM, $"
                    className={inputClass}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted">Pilih minimal 1 negara dulu buat set harga bid-nya.</p>
        )}
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Jadwal Mulai</h3>
        <div className="space-y-1.5">
          {[
            { value: 1 as const, label: "Mulai begitu diverifikasi/disetujui" },
            { value: 2 as const, label: "Jadwalkan tanggal & jam tertentu" },
            { value: 3 as const, label: "Biarin nonaktif dulu" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="radio" name="startOption" checked={startOption === opt.value} onChange={() => setStartOption(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
        {startOption === 2 ? (
          <div className="grid grid-cols-2 gap-3">
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Budget &amp; Limit (opsional)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Total budget, $</label>
            <input type="number" min="0" step="0.01" value={totalBudgetLimit} onChange={(e) => setTotalBudgetLimit(e.target.value)} placeholder="Unlimited" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Budget harian, $</label>
            <input type="number" min="0" step="0.01" value={dailyBudgetLimit} onChange={(e) => setDailyBudgetLimit(e.target.value)} placeholder="Unlimited" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Budget per jam, $</label>
            <input type="number" min="0" step="0.01" value={hourlyBudgetLimit} onChange={(e) => setHourlyBudgetLimit(e.target.value)} placeholder="Unlimited" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Total impression</label>
            <input type="number" min="0" value={totalImpressionsLimit} onChange={(e) => setTotalImpressionsLimit(e.target.value)} placeholder="Unlimited" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Impression harian</label>
            <input type="number" min="0" value={dailyImpressionsLimit} onChange={(e) => setDailyImpressionsLimit(e.target.value)} placeholder="Unlimited" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Impression per jam</label>
            <input type="number" min="0" value={hourlyImpressionsLimit} onChange={(e) => setHourlyImpressionsLimit(e.target.value)} placeholder="Unlimited" className={inputClass} />
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Frequency Capping (opsional)</h3>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={freqEnabled} onChange={(e) => setFreqEnabled(e.target.checked)} />
          Batasi berapa kali iklan tayang ke 1 user
        </label>
        {freqEnabled ? (
          <div className="grid grid-cols-3 gap-3">
            <input type="number" min="1" value={freqAmount} onChange={(e) => setFreqAmount(e.target.value)} placeholder="Jumlah tayang" className={inputClass} />
            <input type="number" min="1" value={freqPeriod} onChange={(e) => setFreqPeriod(e.target.value)} placeholder="Per berapa" className={inputClass} />
            <select value={freqPeriodType} onChange={(e) => setFreqPeriodType(Number(e.target.value) as 1 | 2)} className={inputClass}>
              <option value={1}>Jam</option>
              <option value={2}>Hari</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/60 pt-4 space-y-2">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Optimasi (opsional)</h3>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={isSmartCpm} onChange={(e) => setIsSmartCpm(e.target.checked)} />
          Smart CPM (optimasi bid otomatis)
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={isEvenlyDistributed} onChange={(e) => setIsEvenlyDistributed(e.target.checked)} />
          Sebar budget merata sepanjang waktu
        </label>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Bahasa Browser (opsional)</h3>
        <select
          value={languageInclude ? "include" : "exclude"}
          onChange={(e) => setLanguageInclude(e.target.value === "include")}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-xs mb-1.5"
        >
          <option value="include">Hanya izinkan</option>
          <option value="exclude">Blokir</option>
        </select>
        <MultiSelectChecklist
          label="Bahasa"
          items={languages.map((l) => ({ id: l.id, label: l.name }))}
          selected={languageIds}
          onChange={setLanguageIds}
          placeholder="Cari bahasa..."
        />
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Hari Aktif (opsional)</h3>
        <select
          value={dayOfWeekInclude ? "include" : "exclude"}
          onChange={(e) => setDayOfWeekInclude(e.target.value === "include")}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-xs mb-1.5"
        >
          <option value="include">Hanya izinkan</option>
          <option value="exclude">Blokir</option>
        </select>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={days.has(d.value)} onChange={() => toggleDay(d.value)} />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Jam Tayang (opsional)</h3>
        {timeRanges.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={r.include ? "include" : "exclude"}
              onChange={(e) => updateTimeRange(i, { include: e.target.value === "include" })}
              className="rounded border border-border bg-background px-1.5 py-1.5 text-xs"
            >
              <option value="include">Izinkan</option>
              <option value="exclude">Blokir</option>
            </select>
            <input
              type="number"
              min="0"
              max="23"
              value={r.from}
              onChange={(e) => updateTimeRange(i, { from: e.target.value })}
              placeholder="Jam dari (0-23)"
              className={inputClass}
            />
            <span className="text-xs text-muted">—</span>
            <input
              type="number"
              min="0"
              max="23"
              value={r.to}
              onChange={(e) => updateTimeRange(i, { to: e.target.value })}
              placeholder="Jam sampai (0-23)"
              className={inputClass}
            />
            <button type="button" onClick={() => removeTimeRange(i)} className="text-muted hover:text-danger shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" onClick={addTimeRange} className="flex items-center gap-1.5 text-xs text-accent">
          <Plus size={14} />
          Tambah jam tayang
        </button>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Targeting Browser (opsional)</h3>
        {browserTargets.length > 0 ? (
          <div className="space-y-1.5">
            {browserTargets.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-xs">
                <span>
                  {t.include ? "Izinkan" : "Blokir"} {t.browserName} {RULE_OPTIONS.find((r) => r.value === t.rule)?.label.split(" ")[0]}{" "}
                  v{t.versionName}
                </span>
                <button type="button" onClick={() => removeBrowserTarget(i)} className="text-muted hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <select value={browserDraftId} onChange={(e) => handleBrowserSelect(e.target.value)} className={inputClass}>
            <option value="">Pilih browser...</option>
            {browsers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={browserDraftInclude ? "include" : "exclude"}
            onChange={(e) => setBrowserDraftInclude(e.target.value === "include")}
            className={inputClass}
          >
            <option value="include">Izinkan</option>
            <option value="exclude">Blokir</option>
          </select>
          <select value={browserDraftRule} onChange={(e) => setBrowserDraftRule(Number(e.target.value))} className={inputClass}>
            {RULE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={browserDraftVersionId}
            onChange={(e) => setBrowserDraftVersionId(e.target.value ? Number(e.target.value) : "")}
            disabled={browserVersionsLoading || browserDraftVersions.length === 0}
            className={inputClass}
          >
            <option value="">{browserVersionsLoading ? "Memuat versi..." : "Pilih versi..."}</option>
            {browserDraftVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addBrowserTarget}
          disabled={browserDraftId === "" || browserDraftVersionId === ""}
          className="flex items-center gap-1.5 text-xs text-accent disabled:opacity-50"
        >
          <Plus size={14} />
          Tambah target browser
        </button>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Targeting Sistem Operasi (opsional)</h3>
        {osTargets.length > 0 ? (
          <div className="space-y-1.5">
            {osTargets.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-xs">
                <span>
                  {t.include ? "Izinkan" : "Blokir"} {t.osName} {RULE_OPTIONS.find((r) => r.value === t.rule)?.label.split(" ")[0]} v
                  {t.versionName}
                </span>
                <button type="button" onClick={() => removeOsTarget(i)} className="text-muted hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <select value={osDraftId} onChange={(e) => handleOsSelect(e.target.value)} className={inputClass}>
            <option value="">Pilih OS...</option>
            {operatingSystems.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={osDraftInclude ? "include" : "exclude"}
            onChange={(e) => setOsDraftInclude(e.target.value === "include")}
            className={inputClass}
          >
            <option value="include">Izinkan</option>
            <option value="exclude">Blokir</option>
          </select>
          <select value={osDraftRule} onChange={(e) => setOsDraftRule(Number(e.target.value))} className={inputClass}>
            {RULE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={osDraftVersionId}
            onChange={(e) => setOsDraftVersionId(e.target.value ? Number(e.target.value) : "")}
            disabled={osVersionsLoading || osDraftVersions.length === 0}
            className={inputClass}
          >
            <option value="">{osVersionsLoading ? "Memuat versi..." : "Pilih versi..."}</option>
            {osDraftVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addOsTarget}
          disabled={osDraftId === "" || osDraftVersionId === ""}
          className="flex items-center gap-1.5 text-xs text-accent disabled:opacity-50"
        >
          <Plus size={14} />
          Tambah target OS
        </button>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Targeting Region / Kota (opsional)</h3>
        {locationTargets.length > 0 ? (
          <div className="space-y-1.5">
            {locationTargets.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-xs">
                <span>
                  {t.include ? "Izinkan" : "Blokir"} {t.countryName} — {t.regionName} ({t.cityName})
                </span>
                <button type="button" onClick={() => removeLocationTarget(i)} className="text-muted hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <select value={locationDraftCountryId} onChange={(e) => handleLocationCountrySelect(e.target.value)} className={inputClass}>
            <option value="">Pilih negara...</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <select
            value={locationDraftInclude ? "include" : "exclude"}
            onChange={(e) => setLocationDraftInclude(e.target.value === "include")}
            className={inputClass}
          >
            <option value="include">Izinkan</option>
            <option value="exclude">Blokir</option>
          </select>
          <select
            value={locationDraftRegionId}
            onChange={(e) => handleLocationRegionSelect(e.target.value)}
            disabled={locationRegionsLoading || locationDraftRegions.length === 0}
            className={inputClass}
          >
            <option value="">{locationRegionsLoading ? "Memuat region..." : "Pilih region..."}</option>
            {locationDraftRegions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={locationDraftCityId}
            onChange={(e) => setLocationDraftCityId(Number(e.target.value))}
            disabled={locationCitiesLoading || locationDraftRegionId === ""}
            className={inputClass}
          >
            <option value={0}>{locationCitiesLoading ? "Memuat kota..." : "Seluruh region"}</option>
            {locationDraftCities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addLocationTarget}
          disabled={locationDraftCountryId === "" || locationDraftRegionId === ""}
          className="flex items-center gap-1.5 text-xs text-accent disabled:opacity-50"
        >
          <Plus size={14} />
          Tambah target region/kota
        </button>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Targeting Carrier (opsional)</h3>
        {carrierTargetGroups.length > 0 ? (
          <div className="space-y-1.5">
            {carrierTargetGroups.map((g, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5 text-xs">
                <span>
                  {g.include ? "Izinkan" : "Blokir"} {g.countryName}: {g.carriers.map((c) => c.name).join(", ")}
                </span>
                <button type="button" onClick={() => removeCarrierGroup(i)} className="text-muted hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <select value={carrierDraftCountryId} onChange={(e) => handleCarrierCountrySelect(e.target.value)} className={inputClass}>
            <option value="">Pilih negara...</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <select
            value={carrierDraftInclude ? "include" : "exclude"}
            onChange={(e) => setCarrierDraftInclude(e.target.value === "include")}
            className={inputClass}
          >
            <option value="include">Izinkan</option>
            <option value="exclude">Blokir</option>
          </select>
        </div>
        {carrierOptionsLoading ? (
          <p className="text-xs text-muted">Memuat daftar carrier...</p>
        ) : carrierDraftOptions.length > 0 ? (
          <MultiSelectChecklist
            label="Carrier"
            items={carrierDraftOptions.map((c) => ({ id: c.id, label: c.name }))}
            selected={carrierDraftSelected}
            onChange={setCarrierDraftSelected}
            placeholder="Cari carrier..."
          />
        ) : null}
        <button
          type="button"
          onClick={addCarrierGroup}
          disabled={carrierDraftCountryId === "" || carrierDraftSelected.size === 0}
          className="flex items-center gap-1.5 text-xs text-accent disabled:opacity-50"
        >
          <Plus size={14} />
          Tambah target carrier
        </button>
      </div>

      <div className="border-t border-border/60 pt-4 space-y-2">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">IP List (opsional)</h3>
        <textarea
          value={ipListText}
          onChange={(e) => setIpListText(e.target.value)}
          rows={2}
          placeholder="1 IP atau IP range (CIDR) per baris, misal 192.168.1.1 atau 10.0.0.0/24"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="border-t border-border/60 pt-4 space-y-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer">
          <input type="checkbox" checked={cpaEnabled} onChange={(e) => setCpaEnabled(e.target.checked)} />
          CPA Goal (opsional, buat optimasi otomatis)
        </label>
        {cpaEnabled ? (
          <div className="grid grid-cols-2 gap-3">
            <select value={cpaOptimizationParameter} onChange={(e) => setCpaOptimizationParameter(Number(e.target.value))} className={inputClass}>
              <option value={1}>Optimasi: eCPA</option>
              <option value={2}>Optimasi: Jumlah konversi</option>
            </select>
            <select value={cpaConditionOperator} onChange={(e) => setCpaConditionOperator(Number(e.target.value))} className={inputClass}>
              <option value={1}>Target &gt;</option>
              <option value={2}>Target &gt;=</option>
              <option value={3}>Target &lt;</option>
              <option value={4}>Target &lt;=</option>
            </select>
            <input
              type="number"
              min="0"
              value={cpaConditionValue}
              onChange={(e) => setCpaConditionValue(e.target.value)}
              placeholder="Nilai target"
              className={inputClass}
            />
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={cpaGross}
              onChange={(e) => setCpaGross(e.target.value)}
              placeholder="Gross, $"
              className={inputClass}
            />
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger whitespace-pre-wrap">{error}</div> : null}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2.5 hover:bg-accent/90 disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        Kirim Campaign Request
      </button>
    </form>
  );
}
