"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload, Pencil, Check, X, PlusCircle, ImageOff } from "lucide-react";
import {
  updateCampaignBannerAction,
  deleteCampaignBannerAction,
  replaceCampaignBannerImageAction,
  addCampaignBannerAction,
} from "@/app/dashboard/campaigns/[id]/edit/actions";
import { FilePreviewThumbnails } from "@/components/dashboard/FilePreviewThumbnails";
import type { TrafficStarsBanner } from "@/lib/integrations/trafficstars";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const TRAFFICSTARS_IMAGE_BASE_URL = "https://admin.trafficstars.com/media/";

const bannerStatusStyle: Record<string, string> = {
  running: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  pending: "bg-muted/15 text-muted",
  rejected: "bg-danger/15 text-danger",
  deleted: "bg-danger/15 text-danger",
  processing: "bg-muted/15 text-muted",
};

function BannerRow({ campaignId, banner }: { campaignId: string; banner: TrafficStarsBanner }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [landingUrl, setLandingUrl] = useState(banner.urls?.[0]?.url ?? "");
  const [headline, setHeadline] = useState(banner.headline ?? "");
  const [brandname, setBrandname] = useState(banner.brandname ?? "");
  const [frequencyCapping, setFrequencyCapping] = useState(banner.frequency_capping ? String(banner.frequency_capping) : "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCreative = Boolean(banner.image || banner.video || banner.content);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = banner.image ? `${TRAFFICSTARS_IMAGE_BASE_URL}${banner.image}` : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateCampaignBannerAction(campaignId, banner.id, {
        landingUrl: landingUrl.trim() || undefined,
        landingUrlId: banner.urls?.[0]?.id,
        headline: headline.trim(),
        brandname: brandname.trim(),
        frequencyCapping: frequencyCapping ? Number(frequencyCapping) : undefined,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan perubahan banner.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Hapus banner ini dari campaign?")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCampaignBannerAction(campaignId, banner.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus banner.");
      setDeleting(false);
    }
  }

  async function handleReplaceImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await replaceCampaignBannerImageAction(campaignId, banner.id, file);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal ganti gambar.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Preview creative"
              onError={() => setImageFailed(true)}
              className="h-9 w-auto max-w-[72px] rounded border border-border/60 object-contain bg-background"
            />
          ) : hasCreative ? (
            <span className="text-foreground">Ada creative terpasang</span>
          ) : (
            <span className="flex items-center gap-1 text-warning">
              <ImageOff size={12} />
              Belum ada gambar/video
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 font-medium ${bannerStatusStyle[banner.status] ?? "bg-muted/15 text-muted"}`}>
            {banner.status}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!editing ? (
            <button onClick={() => setEditing(true)} title="Edit banner" className="text-muted hover:text-foreground">
              <Pencil size={14} />
            </button>
          ) : null}
          <button onClick={handleDelete} disabled={deleting} title="Hapus banner" className="text-muted hover:text-danger disabled:opacity-50">
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="text-xs space-y-0.5">
          <p className="truncate">
            <span className="text-muted">Link: </span>
            {banner.urls?.[0]?.url ? (
              <a href={banner.urls[0].url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {banner.urls[0].url}
              </a>
            ) : (
              <span className="text-muted">-</span>
            )}
          </p>
          {banner.headline ? <p><span className="text-muted">Headline: </span>{banner.headline}</p> : null}
          {banner.brandname ? <p><span className="text-muted">Brand: </span>{banner.brandname}</p> : null}
          {banner.frequency_capping ? <p><span className="text-muted">Freq cap: </span>{banner.frequency_capping}x/24 jam</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={landingUrl}
            onChange={(e) => setLandingUrl(e.target.value)}
            placeholder="Landing URL"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Headline"
              className={inputClass}
            />
            <input
              type="text"
              value={brandname}
              onChange={(e) => setBrandname(e.target.value)}
              placeholder="Brand name"
              className={inputClass}
            />
          </div>
          <input
            type="number"
            min="0"
            value={frequencyCapping}
            onChange={(e) => setFrequencyCapping(e.target.value)}
            placeholder="Frequency cap"
            className={inputClass}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-accent text-white text-xs font-medium px-2.5 py-1.5 hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Simpan
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 rounded-lg border border-border text-xs font-medium px-2.5 py-1.5 hover:bg-surface-2"
            >
              <X size={12} />
              Batal
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-1.5 text-xs text-accent cursor-pointer w-fit">
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        Ganti gambar/video
        <input type="file" accept="image/*,video/*" onChange={handleReplaceImage} disabled={uploading} className="hidden" />
      </label>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function TrafficStarsCampaignBanners({
  campaignId,
  initialBanners,
}: {
  campaignId: string;
  initialBanners: TrafficStarsBanner[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [landingUrl, setLandingUrl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [headline, setHeadline] = useState("");
  const [brandname, setBrandname] = useState("");
  const [ctaBrandname, setCtaBrandname] = useState("");
  const [frequencyCapping, setFrequencyCapping] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await addCampaignBannerAction(campaignId, {
        landingUrl,
        images,
        headline,
        brandname,
        ctaBrandname,
        frequencyCapping: frequencyCapping ? Number(frequencyCapping) : 0,
      });
      setLandingUrl("");
      setImages([]);
      setHeadline("");
      setBrandname("");
      setCtaBrandname("");
      setFrequencyCapping("");
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Gagal bikin banner baru.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Banner / Creative</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-accent"
        >
          <PlusCircle size={14} />
          Tambah banner
        </button>
      </div>

      {initialBanners.length === 0 ? (
        <p className="text-xs text-muted">Belum ada banner di campaign ini.</p>
      ) : (
        <div className="space-y-2">
          {initialBanners.map((b) => (
            <BannerRow key={b.id} campaignId={campaignId} banner={b} />
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
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
              placeholder="https://domain-kamu.com/offer"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">Gambar/video — boleh pilih lebih dari 1</label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => setImages(e.target.files ? Array.from(e.target.files) : [])}
              className="w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:text-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <FilePreviewThumbnails files={images} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Headline (opsional)"
              className={inputClass}
            />
            <input
              type="text"
              value={brandname}
              onChange={(e) => setBrandname(e.target.value)}
              placeholder="Brand name (opsional)"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={ctaBrandname}
              onChange={(e) => setCtaBrandname(e.target.value)}
              placeholder="CTA brand name (wajib buat video)"
              className={inputClass}
            />
            <input
              type="number"
              min="0"
              value={frequencyCapping}
              onChange={(e) => setFrequencyCapping(e.target.value)}
              placeholder="Frequency cap"
              className={inputClass}
            />
          </div>

          {addError ? <p className="text-xs text-danger whitespace-pre-wrap">{addError}</p> : null}

          <button
            type="submit"
            disabled={adding}
            className="flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-medium px-4 py-2 hover:bg-accent/90 disabled:opacity-60"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Buat Banner
          </button>
        </form>
      ) : null}
    </div>
  );
}
