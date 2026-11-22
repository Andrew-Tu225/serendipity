import type { Coordinates, MapPlace } from "./places";
import type { CharacterAppearance } from "./character";

export const placeCategories = ["restaurant", "cafe", "bar", "trail", "park", "viewpoint", "gym", "climbing", "museum", "gallery", "bookstore", "shop", "attraction", "other"] as const;
export type PlaceCategory = typeof placeCategories[number];
export type MapBounds = { south: number; west: number; north: number; east: number };
export interface AppExperience {
  id: string;
  author_id: string;
  author_name: string;
  author_character?: CharacterAppearance | null;
  rating: number;
  verdict: "recommend" | "neutral" | "avoid";
  review: string | null;
  photo_urls: string[];
  visited_on: string;
  is_friend: boolean;
  is_self: boolean;
}
export interface DiscoveryPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: PlaceCategory;
  google_place_id: string | null;
  rating_summary: { average: number; count: number };
  friend_count: number;
  friends: AppExperience[];
}
export interface PlaceExperiences {
  place: DiscoveryPlace;
  experiences: AppExperience[];
  next_offset: number | null;
}
export interface ExperienceDraft {
  place_id?: string;
  new_place?: Coordinates & { name: string; category: PlaceCategory; google_place_id?: string };
  rating: number;
  review: string;
  verdict: AppExperience["verdict"];
  visited_on: string;
}

export function mapPlace(place: DiscoveryPlace): MapPlace {
  const category = ["restaurant", "cafe", "bar"].includes(place.category) ? "Food"
    : ["trail", "park", "viewpoint", "gym", "climbing"].includes(place.category) ? "Outdoors" : "Culture";
  const friend = place.friends[0];
  return {
    place_id: place.id, app_id: place.id, source: "app", display_name: place.name,
    address: "", location: { latitude: place.latitude, longitude: place.longitude }, category,
    google_place_id: place.google_place_id ?? undefined, app_category: place.category,
    google_maps_uri: `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}${place.google_place_id ? `&query_place_id=${encodeURIComponent(place.google_place_id)}` : ""}`,
    attributions: [], rating_summary: place.rating_summary.count ? place.rating_summary : undefined, friend_count: place.friend_count,
    friend: friend ? {
      id: friend.author_id, name: friend.author_name, note: friend.verdict === "recommend" ? "recommends this" : friend.verdict === "avoid" ? "suggests avoiding this" : "reviewed this",
      review: friend.review ?? "", character: friend.author_character,
    } : undefined,
  };
}
