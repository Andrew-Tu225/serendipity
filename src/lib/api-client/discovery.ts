import type { DiscoveryPlace, ExperienceDraft, MapBounds, PlaceExperiences } from "@/types/discovery";
import { apiRequest } from "./client";

export const discoveryClient = {
  places(bounds: MapBounds, cursor: string | null, signal?: AbortSignal) {
    const params = new URLSearchParams({ bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(",") });
    if (cursor) params.set("cursor", cursor);
    return apiRequest<{ places: DiscoveryPlace[]; next_cursor: string | null }>(`/discovery/places?${params}`, { signal });
  },
  resolve(googleId: string, signal?: AbortSignal) {
    return apiRequest<DiscoveryPlace>(`/discovery/places/by-google-id/${encodeURIComponent(googleId)}`, { signal });
  },
  details(placeId: string, offset = 0, signal?: AbortSignal) {
    return apiRequest<PlaceExperiences>(`/discovery/places/${encodeURIComponent(placeId)}?offset=${offset}`, { signal });
  },
  createExperience(draft: ExperienceDraft, csrfToken: string) {
    return apiRequest<PlaceExperiences>("/discovery/experiences", { method: "POST", body: draft, csrfToken });
  },
};
