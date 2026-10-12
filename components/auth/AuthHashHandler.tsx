"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Link undangan/konfirmasi Supabase mendarat di sini dengan token sesi di URL
 * hash (#access_token=...&refresh_token=...). Client Supabase versi SSR tidak
 * otomatis membaca hash ini, jadi kita parse manual dan pasang sesinya,
 * lalu reload bersih supaya server merender ulang pakai sesi yang benar
 * (bukan sesi lama yang mungkin masih nyangkut di browser ini).
 */
export function AuthHashHandler() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (!error) {
        window.location.replace(window.location.pathname);
      }
    });
  }, []);

  return null;
}
