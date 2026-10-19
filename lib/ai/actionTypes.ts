export const ASSISTANT_ACTION_TYPES = ["sync_network", "pause_campaign", "resume_campaign"] as const;

export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number];

export type AssistantActionProposal = {
  type: AssistantActionType;
  targetId: string;
  label: string;
  detail: string;
};

export type PendingAssistantAction = AssistantActionProposal & {
  token: string;
  userId: string;
  expiresAt: number;
};

export function isAssistantActionType(value: unknown): value is AssistantActionType {
  return typeof value === "string" && (ASSISTANT_ACTION_TYPES as readonly string[]).includes(value);
}
