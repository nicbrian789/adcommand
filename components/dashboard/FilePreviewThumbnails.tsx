"use client";

import { useEffect, useMemo } from "react";

export function FilePreviewThumbnails({ files }: { files: File[] }) {
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
        <div key={i} className="relative">
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
        </div>
      ))}
    </div>
  );
}
