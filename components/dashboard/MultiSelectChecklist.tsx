"use client";

import { useMemo, useState } from "react";

export function MultiSelectChecklist({
  label,
  items,
  selected,
  onChange,
  placeholder = "Cari...",
}: {
  label: string;
  items: { id: number; label: string }[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  placeholder?: string;
}) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, filter]);

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  function toggleAllFiltered() {
    const next = new Set(selected);
    if (allFilteredSelected) for (const i of filtered) next.delete(i.id);
    else for (const i of filtered) next.add(i.id);
    onChange(next);
  }

  return (
    <div>
      <label className="block text-xs text-muted mb-1.5">
        {label} {selected.size > 0 ? `(${selected.size} dipilih)` : null}
      </label>
      {items.length > 6 ? (
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent mb-2"
        />
      ) : null}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border/60">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted px-3 py-2">Nggak ada yang cocok.</p>
        ) : (
          <>
            {items.length > 6 ? (
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-2 font-medium">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
                {allFilteredSelected ? "Hapus centang semua" : "Centang semua"} ({filtered.length})
              </label>
            ) : null}
            {filtered.map((i) => (
              <label key={i.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-2">
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                {i.label}
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
