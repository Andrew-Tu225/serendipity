import type { CharacterAppearance } from "./character";

export interface BuddyPerson {
  id: string;
  display_name: string;
  character: CharacterAppearance | null;
}

export interface BuddySuggestion extends BuddyPerson {
  match_percent: number | null;
  location?: string;
  interests?: string[];
}

export interface BuddyMessage {
  id: string;
  body: string;
  from_you: boolean;
  sent_at: string;
}

export interface BuddyThread {
  buddy: BuddyPerson;
  latest: BuddyMessage;
}

export interface BuddyInboxPage {
  threads: BuddyThread[];
  next_offset: number | null;
}

export interface BuddyConversation {
  messages: BuddyMessage[];
  next_before: string | null;
}
