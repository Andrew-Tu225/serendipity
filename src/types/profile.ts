import type { PlaceCategory } from "./discovery";

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
