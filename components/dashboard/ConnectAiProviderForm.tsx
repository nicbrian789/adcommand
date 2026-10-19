"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/ai/providers";
import { disconnectAiConnection, saveAiConnection } from "@/app/dashboard/settings/actions";

export function ConnectAiProviderForm({
  canManage,
  initialProvider,
  initialModel,
  hint,
  source,
}: {
  canManage: boolean;
  initialProvider: AiProviderId | null;
  initialModel: string | null;
  hint: string | null;
  source: "workspace" | "env" | null;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<AiProviderId>(initialProvider ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialModel ?? "");
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!canManage) {
    return (
      <div className="space-y-2 text-sm text-muted">
        {source === "workspace" && initialProvider ? (
          <p>
            Workspace memakai <span className="text-foreground font-medium">{initialProvider}</span>
            {hint ? ` (${hint})` : ""}. Hanya Owner yang bisa ganti key.
          </p>
        ) : source === "env" ? (
          <p>AI memakai key server (env). Minta Owner menyambungkan OpenAI/Claude di Settings bila ingin BYOK.</p>
        ) : (
          <p>AI belum tersambung. Minta Owner workspace untuk menghubungkan ChatGPT atau Claude.</p>
        )}
      </div>
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const result = await saveAiConnection({
      provider,
      apiKey,
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApiKey("");
    setOk("Koneksi AI tersimpan.");
    router.refresh();
  }

  async function onDisconnect() {
    setLoading(true);
    setError(null);
    setOk(null);
    const result = await disconnectAiConnection();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOk("Koneksi AI workspace diputus.");
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <p className="text-xs text-muted">
        Pilih provider yang kamu pakai. API key disimpan terenkripsi di server workspace (bukan di browser). Anggota
        workspace memakai koneksi yang sama.
      </p>

      {source === "workspace" && hint ? (
        <p className="text-xs text-success">
          Terhubung: {initialProvider} {hint}
          {initialModel ? ` · model ${initialModel}` : ""}
        </p>
      ) : source === "env" ? (
        <p className="text-xs text-muted">Saat ini fallback ke OPENAI_API_KEY server. Simpan key workspace untuk menggantinya.</p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs text-muted">Provider</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProviderId)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted">API key</span>
        <input
          type="password"
          required
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted">Model (opsional)</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-muted">Base URL (opsional, OpenAI-compatible)</span>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="kosongkan untuk default resmi"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {ok ? <p className="text-xs text-success">{ok}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={loading || !apiKey.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent text-white px-3 py-2 text-xs font-medium hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Simpan koneksi
        </button>
        {source === "workspace" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void onDisconnect()}
            className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-foreground disabled:opacity-60"
          >
            Putuskan
          </button>
        ) : null}
      </div>
    </form>
  );
}
