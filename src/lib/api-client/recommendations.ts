import type { Recommendation } from "@/types/recommendations";
import { apiRequest } from "./client";

export const recommendationsClient = {
  aroundLondon(signal?: AbortSignal) {
    return apiRequest<{ items: Recommendation[] }>(
      "/recommendations?bbox=-81.4,42.85,-81.1,43.12&limit=12", { signal },
    );
  },
};
