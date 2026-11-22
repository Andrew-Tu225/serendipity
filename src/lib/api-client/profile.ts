import type { PlaceCategory } from "@/types/discovery";
import type { MyProfile } from "@/types/profile";
import { apiRequest } from "./client";

export const profileClient = {
  get(signal?: AbortSignal) { return apiRequest<MyProfile>("/me/profile", { signal }); },
  complete(interests: PlaceCategory[], csrfToken: string) {
    return apiRequest<MyProfile>("/me/onboarding", { method: "PUT", body: { interests }, csrfToken });
  },
};
