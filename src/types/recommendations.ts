import type { PlaceCategory } from "./discovery";

export interface Recommendation {
  place: { id: string; name: string; lat: number; lng: number; category: PlaceCategory };
  kind: "friend" | "similar_taste" | "explore";
  score: number;
  logs: {
    experience_id: string;
    author: { id: string; display_name: string; avatar_url: string | null };
    relation: "following" | "similar_taste" | "community";
    rating: number;
    verdict: "recommend" | "avoid" | "neutral";
    review: string | null;
    photo_urls: string[];
    visited_on: string;
  }[];
}
