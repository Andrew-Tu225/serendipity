import type { AppExperience, PlaceCategory } from "./discovery";

export interface ProfileExperience {
  id: string;
  place_name: string;
  category: PlaceCategory;
  rating: number;
  verdict: AppExperience["verdict"];
  rated_on: string;
}

export interface ProfileExperiences {
  display_name: string | null;
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
