export type ChatTurn = { role: "user" | "assistant"; content: string };

type OpenAiChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
};

function readConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

export function isAiAssistantConfigured(): boolean {
  return Boolean(readConfig().apiKey);
}

/**
 * Call an OpenAI-compatible Chat Completions API.
 * Secrets stay server-side; never pass network API keys into messages.
 */
export async function completeAssistantChat(params: {
  system: string;
  history: ChatTurn[];
  userMessage: string;
}): Promise<string> {
  const { apiKey, baseUrl, model } = readConfig();
  if (!apiKey) {
    throw new Error(
      "AI Assisten belum dikonfigurasi. Isi OPENAI_API_KEY di .env.local (opsional: OPENAI_MODEL, OPENAI_BASE_URL)."
    );
  }

  const messages = [
    { role: "system" as const, content: params.system },
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: params.userMessage },
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages,
    }),
  });

  const text = await res.text();
  let data: OpenAiChatResponse;
  try {
    data = JSON.parse(text) as OpenAiChatResponse;
  } catch {
    // Do not forward raw upstream body to callers (may contain sensitive details).
    throw new Error(`Respons AI bukan JSON (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(`Panggilan AI gagal (${res.status}).`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Respons AI kosong.");
  return content;
}
