import { AiAssistantChat } from "@/components/dashboard/AiAssistantChat";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceAiPublicSettings } from "@/lib/ai/workspaceAi";
import Link from "next/link";

export default async function AssistantPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
        Supabase belum dikonfigurasi.
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ai = user ? await getWorkspaceAiPublicSettings(supabase, user.id) : null;

  return (
    <div className="space-y-3 max-w-3xl">
      {!ai?.configured ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          AI belum tersambung.{" "}
          {ai?.canManage ? (
            <>
              Sambungkan ChatGPT atau Claude di{" "}
              <Link href="/dashboard/settings" className="underline">
                Settings
              </Link>
              .
            </>
          ) : (
            <>Minta Owner workspace menyambungkan provider AI di Settings.</>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-2 text-xs text-muted">
          Provider aktif: <span className="text-foreground">{ai.provider}</span>
          {ai.model ? ` · ${ai.model}` : ""}
          {ai.source === "env" ? " · via server env" : ai.hint ? ` · ${ai.hint}` : ""}
        </div>
      )}
      <AiAssistantChat />
    </div>
  );
}
