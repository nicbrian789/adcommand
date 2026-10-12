"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ListPlus } from "lucide-react";
import { addDefaultNetworksForMember } from "@/app/dashboard/members/actions";

export function SeedNetworksButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { added } = await addDefaultNetworksForMember(userId);
      setMessage(added > 0 ? `${added} network ditambahin.` : "Udah lengkap semua.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={loading}
        title="Tambahin network default yang belum dia punya"
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-60"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <ListPlus size={12} />}
        Lengkapi Network
      </button>
      {message ? <span className="text-xs text-success">{message}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
