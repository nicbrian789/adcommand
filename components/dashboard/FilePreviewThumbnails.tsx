"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";

export function FilePreviewThumbnails({ files, onRemove }: { files: File[]; onRemove?: (index: number) => void }) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  useEffect(() => {
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [urls]);

  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {files.map((file, i) => (
        <div key={i} className="relative group">
          {file.type.startsWith("video/") ? (
            <video src={urls[i]} className="h-16 w-16 rounded border border-border object-cover bg-background" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={urls[i]}
              alt={file.name}
              className="h-16 w-16 rounded border border-border object-cover bg-background"
            />
          )}
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(i)}
              title="Hapus file ini"
              className="absolute -top-1.5 -right-1.5 rounded-full bg-danger text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
