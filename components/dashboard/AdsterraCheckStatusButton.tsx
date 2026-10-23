"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { checkAdsterraCampaignRequestStatusAction } from "@/app/dashboard/campaigns/actions";

export function AdsterraCheckStatusButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await checkAdsterraCampaignRequestStatusAction(campaignId);
      if (result.status === "Pending") {
        setMessage("Masih direview Adsterra.");
      } else if (result.status === "Approved") {
        setMessage("Disetujui! Campaign udah aktif.");
      } else {
        setMessage(result.declineReason ? `Ditolak: ${result.declineReason}` : "Ditolak Adsterra.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal cek status campaign.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        title="Cek status review campaign ini di Adsterra"
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Cek Status
      </button>
      {message ? <p className="text-xs text-muted text-right max-w-[180px]">{message}</p> : null}
      {error ? <p className="text-xs text-danger text-right max-w-[180px]">{error}</p> : null}
    </div>
  );
}
