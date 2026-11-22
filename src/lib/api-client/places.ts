import type { Coordinates, PlaceDetails, PlaceSuggestion, PlacePhoto } from "@/types/places";
import { apiRequest } from "./client";

export const placesClient = {
  photo(placeId: string, signal?: AbortSignal) {
    return apiRequest<{ photo: PlacePhoto | null }>(`/places/${encodeURIComponent(placeId)}/photo`, { signal });
  },
  nearby(center: Coordinates, radius: number, signal?: AbortSignal) {
    const params = new URLSearchParams({ latitude: String(center.latitude), longitude: String(center.longitude), radius: String(radius) });
    return apiRequest<{ places: PlaceDetails[] }>(`/places/nearby?${params}`, { signal });
  },
  autocomplete(query: string, sessionToken: string, center: Coordinates, signal?: AbortSignal) {
    const params = new URLSearchParams({
      query,
      session_token: sessionToken,
      latitude: String(center.latitude),
      longitude: String(center.longitude),
    });
    return apiRequest<{ suggestions: PlaceSuggestion[] }>(`/places/autocomplete?${params}`, { signal });
  },

  details(placeId: string, sessionToken: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ session_token: sessionToken });
    return apiRequest<PlaceDetails>(`/places/${encodeURIComponent(placeId)}?${params}`, { signal });
  },
};
