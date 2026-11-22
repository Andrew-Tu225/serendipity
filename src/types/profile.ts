import type { AppExperience, PlaceCategory } from "./discovery";
import type { CharacterAppearance } from "./character";

export interface ProfileExperience {
  id: string;
  place_name: string;
  category: PlaceCategory;
  rating: number;
  verdict: AppExperience["verdict"];
  rated_on: string;
}

export interface ProfileExperiences {
  user_id: string;
  display_name: string | null;
  character: CharacterAppearance | null;
  total: number;
  follower_count: number;
  following_count: number;
  bookmark_count: number;
  list_count?: number;
  favorites: ProfileExperience[];
  recent: ProfileExperience[];
  next_offset: number | null;
}

export interface ProfileListEntry {
  id: string;
  name: string;
  location: string;
}

export interface ProfileListSummary {
  id: string;
  name: string;
  entry_count: number;
}

export interface ProfileListCreate {
  id: string;
  name: string;
  first_entry?: ProfileListEntry;
}

export interface ProfileBookmarks {
  places: { id: string; name: string; latitude: number; longitude: number }[];
  next_offset: number | null;
}

export type ConnectionDirection = "followers" | "following";

export interface ProfileConnection {
  id: string;
  display_name: string;
  character?: CharacterAppearance | null;
}

export interface ProfileConnections {
  people: ProfileConnection[];
  next_offset: number | null;
}

export interface MyProfile {
  user: { id: string; display_name: string; avatar_url: string | null };
  interests: PlaceCategory[];
  onboarding_completed_at: string | null;
  experience_count: number;
  saved_place_count: number;
  following_count: number;
}

export const categoryLabels: Record<PlaceCategory, string> = {
  restaurant: "Restaurants", cafe: "Cafés", bar: "Bars", trail: "Trails",
  park: "Parks", viewpoint: "Viewpoints", gym: "Gyms", climbing: "Climbing",
  museum: "Museums", gallery: "Galleries", bookstore: "Bookstores", shop: "Shops",
  attraction: "Attractions", other: "Something else",
};
