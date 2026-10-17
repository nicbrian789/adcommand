"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { colorForMember } from "@/lib/memberColors";

type MemberOption = { id: string; label: string; count?: number };

export function MemberFilterTabs({
  members,
  selected,
  paramName = "member",
}: {
  members: MemberOption[];
  selected: string | null;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set(paramName, id);
    else params.delete(paramName);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => go(null)}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border ${
          selected === null ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted hover:text-foreground"
        }`}
      >
        Semua
      </button>
      {members.map((m) => {
        const color = colorForMember(m.id);
        const active = selected === m.id;
        return (
          <button
            key={m.id}
            onClick={() => go(m.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border ${
              active ? "bg-accent/15 text-foreground" : "text-muted hover:text-foreground"
            }`}
            style={{ borderColor: active ? "var(--accent)" : `${color}55` }}
          >
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            {m.label}
            {m.count !== undefined ? <span className="text-xs text-muted">{m.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
