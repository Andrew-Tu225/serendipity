import { apiRequest } from "./client";
import type { PublicExperience, PublicPerson, PublicProfile } from "@/types/social";
import type { ConnectionDirection } from "@/types/profile";

interface Page<T> { items: T[]; next_offset: number | null }

export const socialClient = {
  profile(userId: string, signal?: AbortSignal) {
    return apiRequest<PublicProfile>(`/users/${encodeURIComponent(userId)}`, { signal });
  },
  async experiences(userId: string, offset: number, signal: AbortSignal) {
    const page = await apiRequest<Page<PublicExperience>>(`/users/${encodeURIComponent(userId)}/experiences?offset=${offset}&limit=20`, { signal });
    return { items: page.items, nextOffset: page.next_offset };
  },
  async connections(userId: string, direction: ConnectionDirection, offset: number, signal: AbortSignal) {
    const page = await apiRequest<Page<PublicPerson>>(`/users/${encodeURIComponent(userId)}/${direction}?offset=${offset}&limit=40`, { signal });
    return { items: page.items, nextOffset: page.next_offset };
  },
};
