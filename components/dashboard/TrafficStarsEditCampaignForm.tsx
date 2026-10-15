"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { updateTrafficStarsCampaignAction } from "@/app/dashboard/campaigns/[id]/edit/actions";
import type { TrafficStarsCampaignDetail } from "@/lib/integrations/trafficstars";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function TrafficStarsEditCampaignForm({
  campaignId,
  detail,
}: {
  campaignId: string;
  detail: TrafficStarsCampaignDetail;
}) {
  const router = useRouter();
  const [name, setName] = useState(detail.name ?? "");
  const [price, setPrice] = useState(String(detail.price ?? ""));
  const [maxDaily, setMaxDaily] = useState(detail.max_daily ? String(detail.max_daily) : "");
  const [totalBudget, setTotalBudget] = useState(detail.total_budget ? String(detail.total_budget) : "");
  const [weight, setWeight] = useState(detail.weight ? String(detail.weight) : "");
  const [trafficType, setTrafficType] = useState<"ron" | "prime" | "members_area" | "">(detail.traffic_type ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await updateTrafficStarsCampaignAction(campaignId, {
        name,
        price: Number(price),
        maxDaily: maxDaily ? Number(maxDaily) : 0,
        totalBudget: totalBudget ? Number(totalBudget) : 0,
        weight: weight ? Number(weight) : 0,
        trafficType,
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
        <div>
          <label className="block text-xs text-muted mb-1.5">Budget harian max ($)</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={maxDaily}
            onChange={(e) => setMaxDaily(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted mt-1">Wajib diisi — TrafficStars nggak punya opsi &quot;tanpa batas&quot; buat budget harian.</p>
        </div>
      </div>

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
          <input type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Tipe traffic</label>
        <select
          value={trafficType}
          onChange={(e) => setTrafficType(e.target.value as "ron" | "prime" | "members_area" | "")}
          className={inputClass}
        >
          <option value="">Biarkan apa adanya</option>
          <option value="ron">RON (semua traffic)</option>
          <option value="prime">Prime</option>
          <option value="members_area">Members Area</option>
        </select>
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
