"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { updateTrafficFactoryCampaignAction } from "@/app/dashboard/campaigns/[id]/edit/actions";
import type { TrafficFactoryCampaignDetail } from "@/lib/integrations/trafficfactory";

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

export function TrafficFactoryEditCampaignForm({
  campaignId,
  detail,
}: {
  campaignId: string;
  detail: TrafficFactoryCampaignDetail;
}) {
  const router = useRouter();
  const [name, setName] = useState(detail.name ?? "");
  const [pricingModel, setPricingModel] = useState(detail.pricingModel ?? 2);
  const [price, setPrice] = useState(detail.price !== null ? String(detail.price) : "");
  const [maxDailyBudget, setMaxDailyBudget] = useState(detail.maxDailyBudget ? String(detail.maxDailyBudget) : "");
  const [totalBudgetLimit, setTotalBudgetLimit] = useState(detail.totalBudgetLimit ? String(detail.totalBudgetLimit) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await updateTrafficFactoryCampaignAction(campaignId, {
        name,
        pricingModel,
        price: Number(price),
        maxDailyBudget: maxDailyBudget ? Number(maxDailyBudget) : 0,
        totalBudgetLimit: totalBudgetLimit ? Number(totalBudgetLimit) : 0,
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
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-6 space-y-4 max-w-lg">
      <div>
        <label className="block text-xs text-muted mb-1.5">Nama campaign</label>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

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

      <p className="text-xs text-muted">
        Targeting negara/kategori/device/OS belum bisa diubah dari sini — atur manual lewat website Traffic Factory kalau perlu.
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
        Simpan Perubahan
      </button>
    </form>
  );
}
