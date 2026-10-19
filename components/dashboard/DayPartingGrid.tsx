"use client";

const DAY_LABELS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 7, label: "Minggu" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export type DayPartingValue = Record<number, Set<number>>;

export function DayPartingGrid({ value, onChange }: { value: DayPartingValue; onChange: (next: DayPartingValue) => void }) {
  function toggleCell(day: number, hour: number) {
    const next: DayPartingValue = { ...value };
    const set = new Set(next[day] ?? []);
    if (set.has(hour)) set.delete(hour);
    else set.add(hour);
    next[day] = set;
    onChange(next);
  }

  function toggleDay(day: number) {
    const current = value[day] ?? new Set<number>();
    const next: DayPartingValue = { ...value };
    next[day] = current.size === HOURS.length ? new Set() : new Set(HOURS);
    onChange(next);
  }

  function clearAll() {
    onChange({});
  }

  const hasAny = Object.values(value).some((s) => s.size > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-muted">Klik nama hari buat centang/hapus semua jam di hari itu. Kosong = aktif sepanjang hari.</p>
        {hasAny ? (
          <button type="button" onClick={clearAll} className="text-xs text-accent hover:underline shrink-0 ml-2">
            Reset
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="text-[10px] border-collapse w-full">
          <thead>
            <tr>
              <th className="w-14"></th>
              {HOURS.map((h) => (
                <th key={h} className="px-0.5 py-1 font-normal text-muted text-center">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((d) => (
              <tr key={d.value}>
                <td
                  className="pl-2 pr-1 py-0.5 text-muted cursor-pointer hover:text-foreground whitespace-nowrap"
                  onClick={() => toggleDay(d.value)}
                >
                  {d.label}
                </td>
                {HOURS.map((h) => {
                  const active = value[d.value]?.has(h) ?? false;
                  return (
                    <td key={h} className="p-px">
                      <button
                        type="button"
                        onClick={() => toggleCell(d.value, h)}
                        title={`${d.label} jam ${h}:00`}
                        className={`h-4 w-4 rounded-sm border border-border/40 ${active ? "bg-accent" : "bg-surface hover:bg-surface-2"}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
