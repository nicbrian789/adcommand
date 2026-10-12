"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { markAllAlertsRead } from "@/app/dashboard/alerts/actions";

export function MarkAllReadButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      await markAllAlertsRead(workspaceId);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-60"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
      Tandai semua dibaca
    </button>
  );
}
