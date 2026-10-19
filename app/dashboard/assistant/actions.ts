"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { buildAdsAssistantContext } from "@/lib/ai/adsContext";
import { buildAssistantSystemPrompt } from "@/lib/ai/systemPrompt";
import { completeAssistantChat, type ChatTurn } from "@/lib/ai/chatComplete";
import { checkAiRateLimit } from "@/lib/ai/rateLimit";
import { looksLikeSecret, safeClientError } from "@/lib/ai/sanitize";
import { parseActionBlock, stripActionBlock } from "@/lib/ai/actionParse";
import { validateParsedAction } from "@/lib/ai/actionValidate";
import { cancelPendingAction, consumePendingAction, createPendingAction } from "@/lib/ai/actionStore";
import { resolveAiCredentialsForUser } from "@/lib/ai/workspaceAi";
import { syncNetwork } from "@/app/dashboard/networks/actions";
import { setTrafficStarsCampaignRunStateAction } from "@/app/dashboard/campaigns/actions";

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;

export type ProposedActionView = {
  token: string;
  type: string;
  label: string;
  detail: string;
  expiresInSec: number;
};

export type AskAssistantResult =
  | {
      ok: true;
      reply: string;
      contextMeta: { dateFrom: string; dateTo: string; workspaceName: string; provider: string; source: string };
      proposal: ProposedActionView | null;
    }
  | { ok: false; error: string };

function sanitizeHistory(raw: unknown): { ok: true; turns: ChatTurn[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: true, turns: [] };
  const out: ChatTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!trimmed) continue;
    if (looksLikeSecret(trimmed)) {
      return {
        ok: false,
        error: "Jangan tempel API key / token / private key di chat (termasuk riwayat). Hapus credential lalu tanya lagi.",
      };
    }
    out.push({ role, content: stripActionBlock(trimmed) });
  }
  return { ok: true, turns: out };
}

export async function askAssistant(message: string, history: unknown = []): Promise<AskAssistantResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase belum dikonfigurasi." };
  }

  const trimmed = (message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!trimmed) return { ok: false, error: "Pesan kosong." };

  if (looksLikeSecret(trimmed)) {
    return {
      ok: false,
      error: "Jangan tempel API key / token / private key di chat. Hapus credential lalu tanya lagi.",
    };
  }

  const historyResult = sanitizeHistory(history);
  if (!historyResult.ok) return { ok: false, error: historyResult.error };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sesi kamu sudah habis. Silakan masuk lagi." };

    const credentials = await resolveAiCredentialsForUser(supabase, user.id);
    if (!credentials) {
      return {
        ok: false,
        error:
          "AI belum tersambung. Owner workspace: buka Settings → sambungkan OpenAI atau Claude. Atau set OPENAI_API_KEY di server.",
      };
    }

    const limit = checkAiRateLimit(user.id);
    if (!limit.ok) {
      return {
        ok: false,
        error: `Terlalu banyak permintaan AI. Coba lagi dalam ~${limit.retryAfterSec} detik.`,
      };
    }

    const ctx = await buildAdsAssistantContext(supabase, user.id);
    const system = buildAssistantSystemPrompt(ctx.summaryText);
    const rawReply = await completeAssistantChat({
      credentials,
      system,
      history: historyResult.turns,
      userMessage: trimmed,
    });

    const displayReply = stripActionBlock(rawReply);
    const parsed = parseActionBlock(rawReply);
    let proposal: ProposedActionView | null = null;

    if (parsed) {
      const validated = validateParsedAction(parsed, ctx.catalog);
      if (validated) {
        const pending = createPendingAction(user.id, validated);
        proposal = {
          token: pending.token,
          type: pending.type,
          label: pending.label,
          detail: pending.detail,
          expiresInSec: Math.max(1, Math.floor((pending.expiresAt - Date.now()) / 1000)),
        };
      }
    }

    return {
      ok: true,
      reply: displayReply,
      contextMeta: {
        dateFrom: ctx.dateFrom,
        dateTo: ctx.dateTo,
        workspaceName: ctx.workspaceName,
        provider: credentials.provider,
        source: credentials.source,
      },
      proposal,
    };
  } catch (err) {
    return { ok: false, error: safeClientError(err) };
  }
}

export type ConfirmActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function confirmAssistantAction(token: string): Promise<ConfirmActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Supabase belum dikonfigurasi." };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sesi kamu sudah habis. Silakan masuk lagi." };

    const pending = consumePendingAction(token, user.id);
    if (!pending) {
      return { ok: false, error: "Usulan aksi tidak ditemukan atau sudah kedaluwarsa. Minta saran baru." };
    }

    console.info("[ai-assistant-audit]", {
      userId: user.id,
      type: pending.type,
      targetId: pending.targetId,
      label: pending.label,
      at: new Date().toISOString(),
    });

    if (pending.type === "sync_network") {
      const result = await syncNetwork(pending.targetId);
      return {
        ok: true,
        message: `Sync selesai: ${result.campaigns} campaign, ${result.days} baris statistik tersimpan.`,
      };
    }

    if (pending.type === "pause_campaign") {
      const result = await setTrafficStarsCampaignRunStateAction(pending.targetId, "pause");
      return { ok: true, message: `Campaign di-pause. Status lokal: ${result.status}.` };
    }

    if (pending.type === "resume_campaign") {
      const result = await setTrafficStarsCampaignRunStateAction(pending.targetId, "run");
      return { ok: true, message: `Campaign dijalankan lagi. Status lokal: ${result.status}.` };
    }

    return { ok: false, error: "Jenis aksi tidak didukung." };
  } catch (err) {
    return { ok: false, error: safeClientError(err, "Gagal mengeksekusi aksi.") };
  }
}

export async function cancelAssistantAction(token: string): Promise<ConfirmActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Supabase belum dikonfigurasi." };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sesi kamu sudah habis. Silakan masuk lagi." };

    const cancelled = cancelPendingAction(token, user.id);
    if (!cancelled) return { ok: false, error: "Usulan aksi tidak ditemukan atau sudah kedaluwarsa." };
    return { ok: true, message: "Usulan aksi dibatalkan." };
  } catch (err) {
    return { ok: false, error: safeClientError(err, "Gagal membatalkan aksi.") };
  }
}
