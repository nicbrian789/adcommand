import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramAlert } from "@/lib/telegram";

type Supabase = SupabaseClient;

export type AlertType = "sync_failed" | "low_balance" | "ctr_drop" | "no_activity" | "new_campaign" | "stale_sync";

const emojiFor: Record<AlertType, string> = {
  sync_failed: "⚠️",
  low_balance: "💸",
  ctr_drop: "📉",
  no_activity: "🚫",
  new_campaign: "🆕",
  stale_sync: "⏰",
};

export async function raiseAlert(
  supabase: Supabase,
  params: { workspaceId: string; networkId?: string; type: AlertType; title: string; message: string }
) {
  const { error } = await supabase.from("alerts").insert({
    workspace_id: params.workspaceId,
    network_id: params.networkId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
  });
  if (error) console.error("Gagal simpan alert ke database:", error.message);

  await sendTelegramAlert(`${emojiFor[params.type]} <b>${params.title}</b>\n${params.message}`);
}

/**
 * Cegah alert yang sama nyepam tiap kali sync diklik berkali-kali dalam rentang waktu pendek.
 * `titleSuffix` dicocokin pakai LIKE "%...suffix" karena judul alert sekarang diawali
 * "[nama pemilik] ..." — bagian depannya bisa beda meski alert-nya sama secara substansi.
 */
export async function hasRecentAlert(
  supabase: Supabase,
  params: { networkId: string; type: AlertType; titleSuffix?: string; cooldownMs: number }
) {
  const since = new Date(Date.now() - params.cooldownMs).toISOString();
  let query = supabase
    .from("alerts")
    .select("id")
    .eq("network_id", params.networkId)
    .eq("type", params.type)
    .gte("created_at", since);
  if (params.titleSuffix) query = query.like("title", `%${params.titleSuffix}`);

  const { data } = await query.limit(1).maybeSingle();
  return Boolean(data);
}
