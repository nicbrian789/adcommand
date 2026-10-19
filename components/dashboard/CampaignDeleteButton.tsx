"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteCampaignAction } from "@/app/dashboard/campaigns/actions";

export function CampaignDeleteButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm(`Hapus campaign "${campaignName}" beneran dari Traffic Factory? Aksi ini nggak bisa dibatalin.`)) return;
    setLoading(true);
    setError(null);
    try {
      await deleteCampaignAction(campaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus campaign.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        title="Hapus campaign ini dari Traffic Factory"
        className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        Hapus
      </button>
      {error ? <p className="text-xs text-danger text-right max-w-[160px]">{error}</p> : null}
    </div>
  );
}
