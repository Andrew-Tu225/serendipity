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
  favorites: ProfileExperience[];
  recent: ProfileExperience[];
  next_offset: number | null;
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

export interface ProfilePage<T> {
  items: T[];
  nextOffset: number | null;
}
