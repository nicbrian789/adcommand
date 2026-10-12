"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { markAlertRead } from "@/app/dashboard/alerts/actions";

export function MarkReadButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      await markAlertRead(alertId);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      title="Tandai sudah dibaca"
      className="shrink-0 rounded-lg border border-border p-1.5 text-muted hover:text-foreground disabled:opacity-60"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
    </button>
  );
}
