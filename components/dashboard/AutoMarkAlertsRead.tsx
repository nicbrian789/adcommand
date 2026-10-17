"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markAlertsSeen } from "@/app/dashboard/alerts/actions";

export function AutoMarkAlertsRead({ alertIds }: { alertIds: string[] }) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || alertIds.length === 0) return;
    done.current = true;
    markAlertsSeen(alertIds).then(() => router.refresh());
  }, [alertIds, router]);

  return null;
}
