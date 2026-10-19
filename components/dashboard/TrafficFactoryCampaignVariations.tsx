"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload, PlusCircle, ImageOff } from "lucide-react";
import {
  addTrafficFactoryVariationAction,
  deleteTrafficFactoryVariationAction,
} from "@/app/dashboard/campaigns/[id]/edit/actions";
import { FilePreviewThumbnails } from "@/components/dashboard/FilePreviewThumbnails";
import type { TrafficFactoryVariation } from "@/lib/integrations/trafficfactory";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function VariationRow({ campaignId, variation }: { campaignId: string; variation: TrafficFactoryVariation }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  async function handleDelete() {
    if (!confirm("Hapus creative ini dari campaign?")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTrafficFactoryVariationAction(campaignId, variation.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus creative.");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-3 flex items-center gap-3">
      {variation.imageUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={variation.imageUrl}
          alt={variation.name ?? "Creative"}
          onError={() => setImageFailed(true)}
          className="h-9 w-auto max-w-[72px] rounded border border-border/60 object-contain bg-background shrink-0"
        />
      ) : (
        <span className="flex items-center gap-1 text-warning text-xs shrink-0">
          <ImageOff size={12} />
          Tanpa gambar
        </span>
      )}
      <div className="min-w-0 flex-1 text-xs space-y-0.5">
        {variation.landingUrl ? (
          <a href={variation.landingUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline truncate block">
            {variation.landingUrl}
          </a>
        ) : (
          <span className="text-muted">Tanpa landing URL</span>
        )}
        {variation.statusLabel ? <p className="text-muted">{variation.statusLabel}</p> : null}
        {error ? <p className="text-danger">{error}</p> : null}
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Hapus creative"
        className="text-muted hover:text-danger disabled:opacity-50 shrink-0"
      >
        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
      </button>
    </div>
  );
}

export function TrafficFactoryCampaignVariations({
  campaignId,
  initialVariations,
}: {
  campaignId: string;
  initialVariations: TrafficFactoryVariation[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [durl, setDurl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await addTrafficFactoryVariationAction(campaignId, { durl, images });
      setDurl("");
      setImages([]);
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Gagal upload creative.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Creative (Variation)</h2>
        <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1.5 text-xs text-accent">
          <PlusCircle size={14} />
          Tambah creative
        </button>
      </div>

      {initialVariations.length === 0 ? (
        <p className="text-xs text-muted">Belum ada creative di campaign ini — campaign nggak bisa jalan sampai ada minimal 1.</p>
      ) : (
        <div className="space-y-2">
          {initialVariations.map((v) => (
            <VariationRow key={v.id} campaignId={campaignId} variation={v} />
          ))}
        </div>
      )}

      {showAdd ? (
        <form onSubmit={handleAdd} className="rounded-lg border border-border/60 p-4 bg-surface-2/40 space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1.5">Landing URL</label>
            <input
              type="text"
              required
              value={durl}
              onChange={(e) => setDurl(e.target.value)}
              placeholder="https://domain-kamu.com/offer"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Gambar — klik lagi buat nambah lebih dari 1, tiap gambar jadi 1 creative terpisah
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const picked = e.target.files ? Array.from(e.target.files) : [];
                setImages((prev) => [...prev, ...picked]);
                e.target.value = "";
              }}
              className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <p className="text-xs text-muted mt-1">
              Video belum didukung dari sini — upload video manual lewat website Traffic Factory kalau perlu.
            </p>
            <FilePreviewThumbnails files={images} onRemove={(i) => setImages((prev) => prev.filter((_, idx) => idx !== i))} />
          </div>

          {addError ? <p className="text-xs text-danger whitespace-pre-wrap">{addError}</p> : null}

          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90 disabled:opacity-60"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload Creative
          </button>
        </form>
      ) : null}
    </div>
  );
}
