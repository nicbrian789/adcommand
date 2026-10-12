"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ConnectNetworkKey } from "@/components/dashboard/ConnectNetworkKey";
import { SyncNetworkButton } from "@/components/dashboard/SyncNetworkButton";

export function NetworkActions({
  networkId,
  enabled,
  campaignCount,
  hasKey,
  supportsSync,
}: {
  networkId: string;
  enabled: boolean;
  campaignCount: number;
  hasKey: boolean;
  supportsSync: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleEnabled() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("ad_networks")
      .update({ enabled: !enabled })
      .eq("id", networkId);

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  async function remove() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("ad_networks")
      .delete()
      .eq("id", networkId)
      .select("id");

    setLoading(false);
    setConfirming(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (!data || data.length === 0) {
      setError("Network tidak terhapus. Cek izin akses di database.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <ConnectNetworkKey networkId={networkId} hasKey={hasKey} />
      {supportsSync && hasKey ? <SyncNetworkButton networkId={networkId} /> : null}

      <div className="flex items-center gap-2">
        <button
          onClick={toggleEnabled}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-60"
        >
          {loading && !confirming ? <Loader2 size={12} className="animate-spin" /> : null}
          {enabled ? "Nonaktifkan" : "Aktifkan"}
        </button>

        {confirming ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-danger text-right max-w-[260px]">
              {campaignCount > 0
                ? `Network ini punya ${campaignCount} campaign. Jika dihapus, semua campaign di dalamnya ikut terhapus permanen.`
                : "Hapus network ini? Tindakan ini tidak bisa dibatalkan."}
            </span>
            <div className="flex gap-2">
              <button
                onClick={remove}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-danger text-white px-3 py-1.5 text-xs font-medium hover:bg-danger/90 disabled:opacity-60"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : null}
                Ya, hapus
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            Hapus
          </button>
        )}
      </div>

      {error ? <span className="text-xs text-danger max-w-[260px] text-right">{error}</span> : null}
    </div>
  );
}
