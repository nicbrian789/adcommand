"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

  const pill = (active: boolean) =>
    `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border ${
      active ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => go(null)} className={pill(selected === null)}>
        Semua
      </button>
      {members.map((m) => (
        <button key={m.id} onClick={() => go(m.id)} className={pill(selected === m.id)}>
          {m.label}
          {m.count !== undefined ? <span className="text-xs text-muted">{m.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
