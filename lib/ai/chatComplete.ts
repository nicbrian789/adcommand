import type { AiProviderId, ResolvedAiCredentials } from "@/lib/ai/providers";

export type ChatTurn = { role: "user" | "assistant"; content: string };

type OpenAiChatResponse = {
  choices?: { message?: { content?: string | null } }[];
};

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
};

async function completeOpenAi(
  creds: ResolvedAiCredentials,
  system: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string> {
  const baseUrl = (creds.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const messages = [
    { role: "system" as const, content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: creds.model,
      temperature: 0.3,
      messages,
    }),
  });

  const text = await res.text();
  let data: OpenAiChatResponse;
  try {
    data = JSON.parse(text) as OpenAiChatResponse;
  } catch {
    throw new Error(`Respons AI bukan JSON (${res.status}).`);
  }
  if (!res.ok) throw new Error(`Panggilan AI gagal (${res.status}).`);
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Respons AI kosong.");
  return content;
}

async function completeAnthropic(
  creds: ResolvedAiCredentials,
  system: string,
  history: ChatTurn[],
  userMessage: string
): Promise<string> {
  const baseUrl = (creds.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": creds.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: creds.model,
      max_tokens: 2048,
      temperature: 0.3,
      system,
      messages,
    }),
  });

  const text = await res.text();
  let data: AnthropicResponse;
  try {
    data = JSON.parse(text) as AnthropicResponse;
  } catch {
    throw new Error(`Respons AI bukan JSON (${res.status}).`);
  }
  if (!res.ok) throw new Error(`Panggilan AI gagal (${res.status}).`);
  const content = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
  if (!content) throw new Error("Respons AI kosong.");
  return content;
}

export async function completeAssistantChat(params: {
  credentials: ResolvedAiCredentials;
  system: string;
  history: ChatTurn[];
  userMessage: string;
}): Promise<string> {
  const provider: AiProviderId = params.credentials.provider;
  if (provider === "anthropic") {
    return completeAnthropic(params.credentials, params.system, params.history, params.userMessage);
  }
  return completeOpenAi(params.credentials, params.system, params.history, params.userMessage);
}
