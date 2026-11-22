import type { BuddyConversation, BuddyInboxPage, BuddyMessage, BuddySuggestion } from "@/types/buddies";
import { apiRequest } from "./client";

export const buddyClient = {
  suggestions(signal?: AbortSignal): Promise<BuddySuggestion[]> {
    return apiRequest<BuddySuggestion[]>("/buddies/suggestions", { signal });
  },
  skip(buddyId: string, csrfToken: string): Promise<void> {
    return apiRequest<void>(`/buddies/skips/${encodeURIComponent(buddyId)}`, { method: "PUT", csrfToken });
  },
  inbox(offset: number, signal: AbortSignal): Promise<BuddyInboxPage> {
    return apiRequest<BuddyInboxPage>(`/buddies/inbox?offset=${offset}`, { signal });
  },
  history(buddyId: string, before?: string, signal?: AbortSignal): Promise<BuddyConversation> {
    const query = before ? `?before=${encodeURIComponent(before)}` : "";
    return apiRequest<BuddyConversation>(`/buddies/chats/${encodeURIComponent(buddyId)}${query}`, { signal });
  },
  send(buddyId: string, id: string, body: string, csrfToken: string): Promise<BuddyMessage> {
    return apiRequest<BuddyMessage>(`/buddies/chats/${encodeURIComponent(buddyId)}`, {
      method: "POST", body: { id, body }, csrfToken,
    });
  },
};
