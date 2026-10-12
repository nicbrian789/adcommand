"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Link undangan/konfirmasi Supabase kadang mendarat di sini dengan token sesi
 * di URL hash (#access_token=...). Kalau browser itu masih punya sesi lama
 * (login sebagai user lain), halaman sempat ke-render pakai sesi lama itu
 * dulu. Begitu client memproses token baru di hash, paksa reload bersih
 * supaya halaman render ulang pakai sesi yang benar.
 */
export function AuthHashHandler() {
  useEffect(() => {
    if (!window.location.hash.includes("access_token")) return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        window.location.replace(window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
