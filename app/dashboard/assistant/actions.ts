"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { buildAdsAssistantContext } from "@/lib/ai/adsContext";
import { buildAssistantSystemPrompt } from "@/lib/ai/systemPrompt";
import { completeAssistantChat, isAiAssistantConfigured, type ChatTurn } from "@/lib/ai/openaiCompat";
import { checkAiRateLimit } from "@/lib/ai/rateLimit";
import { looksLikeSecret, safeClientError } from "@/lib/ai/sanitize";

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;

export type AskAssistantResult =
  | { ok: true; reply: string; contextMeta: { dateFrom: string; dateTo: string; workspaceName: string } }
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
    out.push({ role, content: trimmed });
  }
  return { ok: true, turns: out };
}

export async function askAssistant(message: string, history: unknown = []): Promise<AskAssistantResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: "Supabase belum dikonfigurasi." };
  }
  if (!isAiAssistantConfigured()) {
    return {
      ok: false,
      error: "AI Assisten belum dikonfigurasi. Isi OPENAI_API_KEY di .env.local.",
    };
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

    const limit = checkAiRateLimit(user.id);
    if (!limit.ok) {
      return {
        ok: false,
        error: `Terlalu banyak permintaan AI. Coba lagi dalam ~${limit.retryAfterSec} detik.`,
      };
    }

    const ctx = await buildAdsAssistantContext(supabase, user.id);
    const system = buildAssistantSystemPrompt(ctx.summaryText);
    const reply = await completeAssistantChat({
      system,
      history: historyResult.turns,
      userMessage: trimmed,
    });

    return {
      ok: true,
      reply,
      contextMeta: {
        dateFrom: ctx.dateFrom,
        dateTo: ctx.dateTo,
        workspaceName: ctx.workspaceName,
      },
    };
  } catch (err) {
    return { ok: false, error: safeClientError(err) };
  }
}
