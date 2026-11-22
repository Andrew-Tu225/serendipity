import type { BuddyMessage, BuddySuggestion } from "@/types/buddies";

export const demoBuddies: BuddySuggestion[] = [
  { id: "Alex Bennett", display_name: "Alex Bennett", character: null, match_percent: 94, age: 28, location: "Brooklyn · 2 mi away", interests: ["Natural wine", "Live jazz", "Hidden gems"], sharedSaves: { count: 12, places: "Clay & rosé and Sunday Jazz Club" } },
  { id: "Elena Rivera", display_name: "Elena Rivera", character: null, match_percent: 91, age: 27, location: "Brooklyn · 3 mi away", interests: ["Pottery", "Coffee", "Small galleries"], sharedSaves: { count: 8, places: "Mend Studio and Porchlight Café" } },
  { id: "Jordan Ellis", display_name: "Jordan Ellis", character: null, match_percent: 89, age: 29, location: "Queens · 5 mi away", interests: ["Weekend hikes", "Listening bars", "Street food"] },
  { id: "Nora Patel", display_name: "Nora Patel", character: null, match_percent: 85, age: 26, location: "Manhattan · 6 mi away", interests: ["Art walks", "Tiny cafés", "Bookshops"] },
];

export const demoBuddyMessages: Record<string, BuddyMessage[]> = {
  "Alex Bennett": [{ id: "demo-alex-1", from_you: false, unread: true, body: "I’ve been wanting to try that jazz spot too.", sent_at: "2025-06-27T20:00:00Z" }],
  "Elena Rivera": [{ id: "demo-elena-1", from_you: false, unread: true, body: "The pottery class was absolutely worth it.", sent_at: "2025-06-27T19:00:00Z" }],
  "Jordan Ellis": [{ id: "demo-jordan-1", from_you: false, unread: false, body: "Saturday works. Want to meet there at 7?", sent_at: "2025-06-24T19:00:00Z" }],
  "Nora Patel": [{ id: "demo-nora-1", from_you: false, unread: false, body: "Sending you my Tokyo list now!", sent_at: "2025-06-22T19:00:00Z" }],
};
