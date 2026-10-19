"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import {
  askAssistant,
  cancelAssistantAction,
  confirmAssistantAction,
  type ProposedActionView,
} from "@/app/dashboard/assistant/actions";

type Turn = {
  role: "user" | "assistant" | "system";
  content: string;
  proposal?: ProposedActionView | null;
  proposalStatus?: "pending" | "done" | "cancelled" | "error";
  proposalResult?: string;
};

const STARTERS = [
  "Kenapa CPR saya mahal?",
  "Campaign mana yang paling boros?",
  "Pause campaign TrafficStars yang CPR-nya paling mahal",
  "Sync network yang datanya paling stale",
];

export function AiAssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actingToken, setActingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;

    setError(null);
    setLoading(true);
    const nextTurns = [...turns, { role: "user" as const, content: message }];
    setTurns(nextTurns);
    setInput("");

    const result = await askAssistant(
      message,
      nextTurns
        .filter((t) => t.role === "user" || t.role === "assistant")
        .slice(0, -1)
        .map((t) => ({ role: t.role as "user" | "assistant", content: t.content }))
    );

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMeta(
      `Konteks: ${result.contextMeta.workspaceName} · ${result.contextMeta.dateFrom} → ${result.contextMeta.dateTo} · AI ${result.contextMeta.provider} (${result.contextMeta.source})`
    );
    setTurns([
      ...nextTurns,
      {
        role: "assistant",
        content: result.reply,
        proposal: result.proposal,
        proposalStatus: result.proposal ? "pending" : undefined,
      },
    ]);
  }

  async function onConfirm(token: string, turnIndex: number) {
    setActingToken(token);
    setError(null);
    const result = await confirmAssistantAction(token);
    setActingToken(null);
    setTurns((prev) =>
      prev.map((t, i) =>
        i === turnIndex
          ? {
              ...t,
              proposalStatus: result.ok ? "done" : "error",
              proposalResult: result.ok ? result.message : result.error,
            }
          : t
      )
    );
  }

  async function onCancel(token: string, turnIndex: number) {
    setActingToken(token);
    setError(null);
    const result = await cancelAssistantAction(token);
    setActingToken(null);
    setTurns((prev) =>
      prev.map((t, i) =>
        i === turnIndex
          ? {
              ...t,
              proposalStatus: result.ok ? "cancelled" : "error",
              proposalResult: result.ok ? result.message : result.error,
            }
          : t
      )
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface flex flex-col min-h-[70vh] max-h-[calc(100vh-8rem)]">
      <div className="border-b border-border px-4 py-3 flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold">AI Assisten</h1>
          <p className="text-xs text-muted">
            Fase 2: saran + usulan aksi terbatas (sync / pause–resume TrafficStars) dengan konfirmasi eksplisit.
          </p>
          {meta ? <p className="text-[11px] text-muted mt-1">{meta}</p> : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Tanyakan masalah ads atau minta usulan aksi. Eksekusi hanya setelah kamu tekan Konfirmasi.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:border-accent/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((t, i) => (
          <div key={`${t.role}-${i}`} className="space-y-2">
            <div
              className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                t.role === "user"
                  ? "bg-accent/15 text-foreground ml-8"
                  : "bg-surface-2/80 text-foreground mr-8 border border-border/60"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
                {t.role === "user" ? "Kamu" : "Assisten"}
              </div>
              {t.content}
            </div>

            {t.proposal ? (
              <div className="mr-8 rounded-lg border border-accent/40 bg-accent/5 px-3 py-3 space-y-2">
                <div className="text-xs font-medium text-foreground">{t.proposal.label}</div>
                <p className="text-xs text-muted whitespace-pre-wrap">{t.proposal.detail}</p>
                {t.proposalStatus === "pending" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={actingToken === t.proposal.token}
                      onClick={() => onConfirm(t.proposal!.token, i)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-3 py-1.5 text-xs font-medium hover:bg-accent/90 disabled:opacity-60"
                    >
                      {actingToken === t.proposal.token ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Konfirmasi
                    </button>
                    <button
                      type="button"
                      disabled={actingToken === t.proposal.token}
                      onClick={() => onCancel(t.proposal!.token, i)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-60"
                    >
                      <X size={12} />
                      Batalkan
                    </button>
                    <span className="text-[10px] text-muted">Berlaku ~{t.proposal.expiresInSec}s</span>
                  </div>
                ) : (
                  <p
                    className={`text-xs ${
                      t.proposalStatus === "error"
                        ? "text-danger"
                        : t.proposalStatus === "cancelled"
                          ? "text-muted"
                          : "text-success"
                    }`}
                  >
                    {t.proposalResult}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ))}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted mr-8">
            <Loader2 size={14} className="animate-spin" />
            Menganalisis data ads…
          </div>
        ) : null}

        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-border p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Contoh: pause campaign TS yang CPR-nya mahal"
          disabled={loading}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-accent text-white px-3 py-2 text-sm font-medium hover:bg-accent/90 disabled:opacity-60 flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Kirim
        </button>
      </form>
    </div>
  );
}
