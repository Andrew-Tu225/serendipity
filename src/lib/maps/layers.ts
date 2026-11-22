import type { MapPlace } from "@/types/places";

export type MarkerLayer = "place" | "review" | "recommendation" | "friend";
export const markerLayerLabels: Record<MarkerLayer, string> = {
  place: "Place without reviews", review: "Reviewed place", recommendation: "Recommended for you", friend: "Reviewed by friends",
};

export function markerLayer(place: MapPlace): MarkerLayer {
  if (place.recommendation) return "recommendation";
  if (place.friend || (place.friend_count ?? 0) > 0) return "friend";
  if ((place.rating_summary?.count ?? 0) > 0) return "review";
  return "place";
}

export function mergeMapLayers(nearby: MapPlace[], reviewed: MapPlace[], recommended: MapPlace[]) {
  const result = new Map(nearby.map((place) => [`google:${place.place_id}`, place]));
  for (const place of reviewed) result.set(`app:${place.place_id}`, place);
  for (const place of recommended) {
    const base = result.get(`app:${place.place_id}`);
    result.set(`app:${place.place_id}`, { ...base, ...place,
      rating_summary: base?.rating_summary ?? place.rating_summary,
      google_place_id: base?.google_place_id ?? place.google_place_id,
      friend: place.friend ?? base?.friend,
      friend_count: base?.friend_count ?? place.friend_count,
    });
  }
  const googleIds = new Set([...result.values()].filter((place) => place.source === "app").map((place) => place.google_place_id).filter(Boolean));
  for (const [key, place] of result) if (place.source === "google" && googleIds.has(place.place_id)) result.delete(key);
  return result;
}
