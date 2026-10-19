import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, hintForApiKey, isAiCredentialsSecretConfigured } from "@/lib/ai/crypto";
import {
  defaultModelFor,
  isAiProviderId,
  type AiProviderId,
  type ResolvedAiCredentials,
} from "@/lib/ai/providers";

export type WorkspaceAiPublicSettings = {
  configured: boolean;
  provider: AiProviderId | null;
  model: string | null;
  hint: string | null;
  source: "workspace" | "env" | null;
  canManage: boolean;
};

async function getPrimaryWorkspace(supabase: SupabaseClient) {
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return workspace;
}

async function getMembership(supabase: SupabaseClient, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function envFallbackCredentials(): ResolvedAiCredentials | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    source: "env",
    provider: "openai",
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || defaultModelFor("openai"),
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || null,
  };
}

/** Public status for UI — never returns the raw API key. */
export async function getWorkspaceAiPublicSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkspaceAiPublicSettings> {
  const workspace = await getPrimaryWorkspace(supabase);
  if (!workspace) {
    return { configured: false, provider: null, model: null, hint: null, source: null, canManage: false };
  }

  const membership = await getMembership(supabase, workspace.id, userId);
  const canManage = membership?.role === "Owner";

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_ai_settings")
      .select("provider, model, api_key_hint")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (data && isAiProviderId(data.provider)) {
      return {
        configured: true,
        provider: data.provider,
        model: data.model,
        hint: data.api_key_hint,
        source: "workspace",
        canManage,
      };
    }
  } catch {
    // Table may not exist yet on older DBs — fall through to env.
  }

  const env = envFallbackCredentials();
  if (env) {
    return {
      configured: true,
      provider: env.provider,
      model: env.model,
      hint: null,
      source: "env",
      canManage,
    };
  }

  return { configured: false, provider: null, model: null, hint: null, source: null, canManage };
}

/** Resolve usable credentials for chat (workspace BYOK first, then env fallback). */
export async function resolveAiCredentialsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ResolvedAiCredentials | null> {
  const workspace = await getPrimaryWorkspace(supabase);
  if (!workspace) return envFallbackCredentials();

  const membership = await getMembership(supabase, workspace.id, userId);
  if (!membership) return null;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_ai_settings")
      .select("provider, model, base_url, api_key_ciphertext")
      .eq("workspace_id", workspace.id)
      .maybeSingle();

    if (data && isAiProviderId(data.provider) && data.api_key_ciphertext) {
      if (!isAiCredentialsSecretConfigured()) {
        throw new Error("AI_CREDENTIALS_SECRET belum diisi di server; tidak bisa membuka key workspace.");
      }
      const apiKey = decryptSecret(data.api_key_ciphertext);
      return {
        source: "workspace",
        provider: data.provider,
        apiKey,
        model: (data.model?.trim() || defaultModelFor(data.provider)),
        baseUrl: data.base_url?.trim() || null,
      };
    }
  } catch (err) {
    // If decrypt/table fails and no env fallback, surface decrypt/config errors.
    if (!envFallbackCredentials()) throw err;
  }

  return envFallbackCredentials();
}

export async function saveWorkspaceAiSettings(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: AiProviderId;
  apiKey: string;
  model?: string | null;
  baseUrl?: string | null;
}) {
  const workspace = await getPrimaryWorkspace(params.supabase);
  if (!workspace) throw new Error("Belum ada workspace.");

  const membership = await getMembership(params.supabase, workspace.id, params.userId);
  if (membership?.role !== "Owner") throw new Error("Hanya Owner yang bisa mengatur koneksi AI.");

  const apiKey = params.apiKey.trim();
  if (apiKey.length < 16) throw new Error("API key terlalu pendek.");
  if (!isAiCredentialsSecretConfigured()) {
    throw new Error("AI_CREDENTIALS_SECRET belum diisi di .env.local (minimal 16 karakter).");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("workspace_ai_settings").upsert(
    {
      workspace_id: workspace.id,
      provider: params.provider,
      api_key_ciphertext: encryptSecret(apiKey),
      api_key_hint: hintForApiKey(apiKey),
      model: params.model?.trim() || defaultModelFor(params.provider),
      base_url: params.baseUrl?.trim() || null,
      updated_by: params.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" }
  );
  if (error) throw new Error(error.message);
}

export async function clearWorkspaceAiSettings(supabase: SupabaseClient, userId: string) {
  const workspace = await getPrimaryWorkspace(supabase);
  if (!workspace) throw new Error("Belum ada workspace.");

  const membership = await getMembership(supabase, workspace.id, userId);
  if (membership?.role !== "Owner") throw new Error("Hanya Owner yang bisa mengatur koneksi AI.");

  const admin = createAdminClient();
  const { error } = await admin.from("workspace_ai_settings").delete().eq("workspace_id", workspace.id);
  if (error) throw new Error(error.message);
}
