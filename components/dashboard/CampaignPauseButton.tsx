"use client";

import { useState } from "react";
import { Pause, Play, Loader2 } from "lucide-react";
import { setCampaignRunStateAction } from "@/app/dashboard/campaigns/actions";

export function CampaignPauseButton({ campaignId, status }: { campaignId: string; status: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === "Paused";
  const action = isPaused ? "run" : "pause";

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      await setCampaignRunStateAction(campaignId, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status campaign.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        title={isPaused ? "Jalankan lagi campaign ini" : "Pause campaign ini"}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : isPaused ? <Play size={12} /> : <Pause size={12} />}
        {isPaused ? "Jalankan" : "Pause"}
      </button>
      {error ? <p className="text-xs text-danger text-right max-w-[160px]">{error}</p> : null}
    </div>
  );
}
