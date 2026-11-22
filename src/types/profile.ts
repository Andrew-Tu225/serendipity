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
  favorites: ProfileExperience[];
  recent: ProfileExperience[];
  next_offset: number | null;
}
