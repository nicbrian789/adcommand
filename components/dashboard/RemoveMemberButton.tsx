"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { removeMember } from "@/app/dashboard/members/actions";

export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setLoading(true);
    setError(null);

    try {
      await removeMember(userId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus anggota.");
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-danger text-right max-w-[220px]">
          Hapus {name}? Akun & network yang dia tambahin ikut terhapus permanen.
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
        {error ? <span className="text-xs text-danger text-right max-w-[220px]">{error}</span> : null}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
    >
      Hapus
    </button>
  );
}
