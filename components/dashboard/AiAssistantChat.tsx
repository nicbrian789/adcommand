"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { askAssistant } from "@/app/dashboard/assistant/actions";

type Turn = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Kenapa CPR saya mahal?",
  "Campaign mana yang paling boros?",
  "Ada alert penting yang harus saya tindaklanjuti?",
  "Apa langkah terbaik menurunkan biaya hasil?",
];

export function AiAssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
      nextTurns.slice(0, -1).map((t) => ({ role: t.role, content: t.content }))
    );

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMeta(`Konteks: ${result.contextMeta.workspaceName} · ${result.contextMeta.dateFrom} → ${result.contextMeta.dateTo}`);
    setTurns([...nextTurns, { role: "assistant", content: result.reply }]);
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
            Fase 1: baca data workspace + saran perbaikan (CPR, CTR, alert). Belum mengeksekusi pause/edit ads.
          </p>
          {meta ? <p className="text-[11px] text-muted mt-1">{meta}</p> : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Tanyakan masalah ads kamu. Assisten memakai statistik 7 hari terakhir dan alert workspace (tanpa API key).
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
          <div
            key={`${t.role}-${i}`}
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
          placeholder="Contoh: kenapa CPR campaign X mahal?"
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
