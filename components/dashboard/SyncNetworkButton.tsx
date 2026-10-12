"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { syncNetwork } from "@/app/dashboard/networks/actions";

export function SyncNetworkButton({ networkId }: { networkId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await syncNetwork(networkId);
      setMessage(`${result.campaigns} campaign, ${result.days} baris statistik tersimpan`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal sinkronisasi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent text-white text-xs font-medium px-3 py-1.5 hover:bg-accent/90 disabled:opacity-60"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        Sync 7 hari
      </button>
      {message ? <span className="text-xs text-success max-w-[260px] text-right">{message}</span> : null}
      {error ? <span className="text-xs text-danger max-w-[260px] text-right">{error}</span> : null}
    </div>
  );
}
