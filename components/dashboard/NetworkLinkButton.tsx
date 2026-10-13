"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Loader2, Pencil } from "lucide-react";
import { setNetworkUrl } from "@/app/dashboard/networks/actions";

export function NetworkLinkButton({
  networkId,
  url,
  canEdit,
}: {
  networkId: string;
  url: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      await setNetworkUrl(networkId, value);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan link.");
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://..."
            className="w-44 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <button
            onClick={save}
            disabled={loading}
            className="rounded-lg bg-accent text-white px-2 py-1 text-xs font-medium hover:bg-accent/90 disabled:opacity-60"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : "Simpan"}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={loading}
            className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
          >
            Batal
          </button>
        </div>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    );
  }

  if (url) {
    return (
      <div className="flex items-center justify-end gap-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={url}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
        >
          <ExternalLink size={12} />
          Buka
        </a>
        {canEdit ? (
          <button
            onClick={() => setEditing(true)}
            title="Edit link"
            className="rounded-lg border border-border p-1.5 text-muted hover:text-foreground"
          >
            <Pencil size={12} />
          </button>
        ) : null}
      </div>
    );
  }

  if (!canEdit) return <span className="text-xs text-muted">-</span>;

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
    >
      <Link2 size={12} />
      Set link
    </button>
  );
}
