import type { PlaceCategory } from "@/types/discovery";
import type { ConnectionDirection, MyProfile, ProfileBookmarks, ProfileConnections, ProfileExperiences, ProfileListCreate, ProfileListEntry, ProfileListSummary } from "@/types/profile";
import type { CharacterAppearance } from "@/types/character";
import { apiRequest } from "./client";

export const profileClient = {
  get(signal?: AbortSignal) { return apiRequest<MyProfile>("/me/profile", { signal }); },
  complete(interests: PlaceCategory[], csrfToken: string) {
    return apiRequest<MyProfile>("/me/onboarding", { method: "PUT", body: { interests }, csrfToken });
  },
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
  async getLists(offset: number, signal: AbortSignal) {
    const { lists, next_offset } = await apiRequest<{ lists: ProfileListSummary[]; next_offset: number | null }>(`/profile/lists?offset=${offset}`, { signal });
    return { items: lists, nextOffset: next_offset };
  },
  createList(list: ProfileListCreate, csrfToken: string) {
    return apiRequest<ProfileListSummary>("/profile/lists", { method: "POST", body: list, csrfToken });
  },
  async getListEntries(listId: string, offset: number, signal: AbortSignal) {
    const { entries, next_offset } = await apiRequest<{ entries: ProfileListEntry[]; next_offset: number | null }>(
      `/profile/lists/${encodeURIComponent(listId)}/entries?offset=${offset}`, { signal },
    );
    return { items: entries, nextOffset: next_offset };
  },
  addListEntry(listId: string, entry: ProfileListEntry, csrfToken: string) {
    return apiRequest<ProfileListEntry>(`/profile/lists/${encodeURIComponent(listId)}/entries`, {
      method: "POST", body: entry, csrfToken,
    });
  },
};
