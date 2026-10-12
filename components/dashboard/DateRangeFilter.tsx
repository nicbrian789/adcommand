"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DATE_PRESETS, presetRange } from "@/lib/dateRange";

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function go(range: { from: string; to: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", range.from);
    params.set("to", range.to);
    router.push(`${pathname}?${params.toString()}`);
  }

  const activePreset = DATE_PRESETS.find((p) => {
    const r = presetRange(p.days);
    return r.from === from && r.to === to;
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {DATE_PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => go(presetRange(p.days))}
          className={`rounded-lg px-3 py-1.5 text-sm border ${
            activePreset?.label === p.label
              ? "border-accent bg-accent/15 text-foreground"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}

      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <span className="text-muted text-sm">–</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={() => go({ from: customFrom, to: customTo })}
          className="rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent/90"
        >
          Terapkan
        </button>
      </div>
    </div>
  );
}
