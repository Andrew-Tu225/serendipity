import type { MapBounds } from "@/types/discovery";
import type { Recommendation } from "@/types/recommendations";
import { apiRequest } from "./client";

export const recommendationsClient = {
  inBounds(bounds: MapBounds, signal?: AbortSignal) {
    const params = new URLSearchParams({
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","), limit: "30",
    });
    return apiRequest<{ items: Recommendation[] }>(`/recommendations?${params}`, { signal });
  },
};
