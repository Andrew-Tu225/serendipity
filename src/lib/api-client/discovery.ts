import type { DiscoveryPlace, ExperienceDraft, PlaceExperiences } from "@/types/discovery";
import { apiRequest } from "./client";

export const discoveryClient = {
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
