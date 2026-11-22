import type { ProfileBookmarks, ProfileExperiences } from "@/types/profile";
import { apiRequest } from "./client";

export const profileClient = {
  getExperiences(offset = 0, limit = 4, signal?: AbortSignal): Promise<ProfileExperiences> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    return apiRequest<ProfileExperiences>(`/profile/experiences?${params}`, { signal });
  },
  getBookmarks(offset: number, signal: AbortSignal): Promise<ProfileBookmarks> {
    return apiRequest<ProfileBookmarks>(`/profile/bookmarks?offset=${offset}`, { signal });
  },
};
