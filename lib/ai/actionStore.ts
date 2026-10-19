import { randomUUID } from "node:crypto";
import type { AssistantActionProposal, PendingAssistantAction } from "@/lib/ai/actionTypes";

const TTL_MS = 5 * 60 * 1000;
const store = new Map<string, PendingAssistantAction>();

function prune(now = Date.now()) {
  for (const [token, item] of store) {
    if (item.expiresAt <= now) store.delete(token);
  }
}

export function createPendingAction(userId: string, proposal: AssistantActionProposal): PendingAssistantAction {
  prune();
  const token = randomUUID();
  const pending: PendingAssistantAction = {
    ...proposal,
    token,
    userId,
    expiresAt: Date.now() + TTL_MS,
  };
  store.set(token, pending);
  return pending;
}

export function getPendingAction(token: string, userId: string): PendingAssistantAction | null {
  prune();
  const item = store.get(token);
  if (!item) return null;
  if (item.userId !== userId) return null;
  if (item.expiresAt <= Date.now()) {
    store.delete(token);
    return null;
  }
  return item;
}

export function consumePendingAction(token: string, userId: string): PendingAssistantAction | null {
  const item = getPendingAction(token, userId);
  if (!item) return null;
  store.delete(token);
  return item;
}

export function cancelPendingAction(token: string, userId: string): boolean {
  const item = getPendingAction(token, userId);
  if (!item) return false;
  store.delete(token);
  return true;
}

export function resetActionStoreForTests() {
  store.clear();
}
