import { isAssistantActionType, type AssistantActionType } from "@/lib/ai/actionTypes";

const ACTION_BLOCK =
  /<<<ACTION>>>\s*([\s\S]*?)\s*<<<END_ACTION>>>/i;

export type ParsedActionBlock = {
  type: AssistantActionType;
  targetId: string;
  reason?: string;
};

/** Strip machine action block from model reply for display. */
export function stripActionBlock(reply: string): string {
  return reply.replace(ACTION_BLOCK, "").trim();
}

export function parseActionBlock(reply: string): ParsedActionBlock | null {
  const match = reply.match(ACTION_BLOCK);
  if (!match?.[1]) return null;
  try {
    const raw = JSON.parse(match[1].trim()) as { type?: unknown; targetId?: unknown; reason?: unknown };
    if (!isAssistantActionType(raw.type)) return null;
    if (typeof raw.targetId !== "string" || !/^[0-9a-f-]{36}$/i.test(raw.targetId.trim())) return null;
    const reason = typeof raw.reason === "string" ? raw.reason.trim().slice(0, 200) : undefined;
    return { type: raw.type, targetId: raw.targetId.trim(), reason };
  } catch {
    return null;
  }
}
