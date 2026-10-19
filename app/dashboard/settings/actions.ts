"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAiProviderId } from "@/lib/ai/providers";
import { clearWorkspaceAiSettings, saveWorkspaceAiSettings } from "@/lib/ai/workspaceAi";
import { safeClientError } from "@/lib/ai/sanitize";

export async function updateFullName(fullName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesi kamu sudah habis. Silakan masuk lagi.");

  const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() || null }).eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
}

export type SaveAiConnectionResult = { ok: true } | { ok: false; error: string };

export async function saveAiConnection(input: {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<SaveAiConnectionResult> {
  try {
    if (!isAiProviderId(input.provider)) return { ok: false, error: "Provider tidak didukung." };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sesi kamu sudah habis. Silakan masuk lagi." };

    await saveWorkspaceAiSettings({
      supabase,
      userId: user.id,
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/assistant");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeClientError(err, "Gagal menyimpan koneksi AI.") };
  }
}

export async function disconnectAiConnection(): Promise<SaveAiConnectionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Sesi kamu sudah habis. Silakan masuk lagi." };

    await clearWorkspaceAiSettings(supabase, user.id);
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/assistant");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeClientError(err, "Gagal memutus koneksi AI.") };
  }
}
