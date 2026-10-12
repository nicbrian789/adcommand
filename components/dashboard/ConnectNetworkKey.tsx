"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ConnectNetworkKey({ networkId, hasKey }: { networkId: string; hasKey: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setApiKey("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc("connect_network", {
      p_network_id: networkId,
      p_api_key: apiKey.trim(),
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    close();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <KeyRound size={12} />
        {hasKey ? "Ganti API key" : "Connect"}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-end gap-2">
      <input
        type="password"
        required
        autoFocus
        autoComplete="off"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Tempel API key dari network"
        className="w-64 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-accent"
      />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent text-white text-xs font-medium px-3 py-1.5 hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Simpan
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
