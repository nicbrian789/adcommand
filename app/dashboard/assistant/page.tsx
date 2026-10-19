import { AiAssistantChat } from "@/components/dashboard/AiAssistantChat";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAiAssistantConfigured } from "@/lib/ai/openaiCompat";

export default function AssistantPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {!isAiAssistantConfigured() ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Set <code className="text-xs">OPENAI_API_KEY</code> di <code className="text-xs">.env.local</code> agar assisten
          bisa menjawab. Opsional: <code className="text-xs">OPENAI_MODEL</code>,{" "}
          <code className="text-xs">OPENAI_BASE_URL</code>.
        </div>
      ) : null}
      <AiAssistantChat />
    </div>
  );
}
