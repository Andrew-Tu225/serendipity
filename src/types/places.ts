export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PlaceSuggestion {
  place_id: string;
  primary_text: string;
  secondary_text: string;
}

export interface PlaceDetails {
  place_id: string;
  display_name: string;
  address: string;
  location: Coordinates;
  viewport?: { low: Coordinates; high: Coordinates } | null;
  google_maps_uri: string;
  attributions: { provider: string; provider_uri?: string | null }[];
}

export interface MapPlace extends PlaceDetails {
  source: "google" | "app";
  app_id?: string;
  google_place_id?: string;
  app_category?: import("./discovery").PlaceCategory;
  friend_count?: number;
  category?: "Food" | "Culture" | "Outdoors";
  rating_summary?: { average: number; count: number };
  friend?: { name: string; note: string; review: string; variant: string };
}
