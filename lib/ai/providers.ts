export const AI_PROVIDERS = [
  { value: "openai", label: "ChatGPT (OpenAI)", defaultModel: "gpt-4o-mini" },
  { value: "anthropic", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-4-5" },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["value"];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "openai" || value === "anthropic";
}

export function defaultModelFor(provider: AiProviderId): string {
  return AI_PROVIDERS.find((p) => p.value === provider)?.defaultModel ?? "gpt-4o-mini";
}

export type ResolvedAiCredentials = {
  source: "workspace" | "env";
  provider: AiProviderId;
  apiKey: string;
  model: string;
  baseUrl: string | null;
};
