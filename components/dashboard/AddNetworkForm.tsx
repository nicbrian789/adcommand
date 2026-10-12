"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NETWORK_TYPES, networkTypeLabel } from "@/lib/networks";

export function AddNetworkForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>(NETWORK_TYPES[0].value);
  const [name, setName] = useState<string>(networkTypeLabel(NETWORK_TYPES[0].value));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setProvider(NETWORK_TYPES[0].value);
    setName(networkTypeLabel(NETWORK_TYPES[0].value));
    setError(null);
  }

  function changeProvider(value: string) {
    setProvider(value);
    setName(networkTypeLabel(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sesi kamu sudah habis. Silakan masuk lagi.");
        return;
      }

      const { error } = await supabase.from("ad_networks").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        name,
        provider,
        enabled: true,
      });

      if (error) {
        setError(error.message);
        return;
      }

      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90"
      >
        <Plus size={14} />
        Add Network
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface p-4 space-y-3 max-w-md w-full">
      <div>
        <label className="block text-xs text-muted mb-1.5">Jenis network</label>
        <select
          value={provider}
          onChange={(e) => changeProvider(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {NETWORK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1.5">Nama di dashboard</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          Simpan
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
