import type { BuddyMessage, BuddySuggestion } from "@/types/buddies";

export const demoBuddies: BuddySuggestion[] = [
  { id: "Alex Bennett", display_name: "Alex Bennett", character: null, match_percent: 94, location: "Brooklyn · 2 mi away", interests: ["Natural wine", "Live jazz", "Hidden gems"] },
  { id: "Elena Rivera", display_name: "Elena Rivera", character: null, match_percent: 91, location: "Brooklyn · 3 mi away", interests: ["Pottery", "Coffee", "Small galleries"] },
  { id: "Jordan Ellis", display_name: "Jordan Ellis", character: null, match_percent: 89, location: "Queens · 5 mi away", interests: ["Weekend hikes", "Listening bars", "Street food"] },
  { id: "Nora Patel", display_name: "Nora Patel", character: null, match_percent: 85, location: "Manhattan · 6 mi away", interests: ["Art walks", "Tiny cafés", "Bookshops"] },
];

export const demoBuddyMessages: Record<string, BuddyMessage[]> = {
  "Alex Bennett": [{ id: "demo-alex-1", from_you: false, body: "I’ve been wanting to try that jazz spot too.", sent_at: "2025-06-27T20:00:00Z" }],
  "Elena Rivera": [{ id: "demo-elena-1", from_you: false, body: "The pottery class was absolutely worth it.", sent_at: "2025-06-27T19:00:00Z" }],
};
