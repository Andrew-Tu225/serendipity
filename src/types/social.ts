import type { CharacterAppearance } from "./character";
import type { AppExperience, PlaceCategory } from "./discovery";

export interface PublicPerson {
  id: string;
  display_name: string;
  avatar_url: string | null;
  character?: CharacterAppearance | null;
}

export interface PublicProfile extends PublicPerson {
  experience_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  follows_you: boolean;
  is_self: boolean;
}

export interface PublicPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: PlaceCategory;
  google_place_id: string | null;
}

export interface PublicExperience {
  id: string;
  author: PublicPerson;
  place: PublicPlace;
  rating: number;
  verdict: AppExperience["verdict"];
  review: string | null;
  visited_on: string;
  photo_urls: string[];
}
