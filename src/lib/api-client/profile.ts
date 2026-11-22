import type { ConnectionDirection, ProfileBookmarks, ProfileConnections, ProfileExperiences } from "@/types/profile";
import type { CharacterAppearance } from "@/types/character";
import { apiRequest } from "./client";

export const profileClient = {
  saveCharacter(appearance: CharacterAppearance, csrfToken: string): Promise<CharacterAppearance> {
    return apiRequest<CharacterAppearance>("/profile/character", { method: "PUT", body: appearance, csrfToken });
  },
  getExperiences(offset = 0, limit = 4, signal?: AbortSignal): Promise<ProfileExperiences> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    return apiRequest<ProfileExperiences>(`/profile/experiences?${params}`, { signal });
  },
  async getBookmarks(offset: number, signal: AbortSignal) {
    const { places, next_offset } = await apiRequest<ProfileBookmarks>(`/profile/bookmarks?offset=${offset}`, { signal });
    return { items: places, nextOffset: next_offset };
  },
  async getConnections(direction: ConnectionDirection, offset: number, signal: AbortSignal) {
    const { people, next_offset } = await apiRequest<ProfileConnections>(`/profile/connections/${direction}?offset=${offset}`, { signal });
    return { items: people, nextOffset: next_offset };
  },
};
