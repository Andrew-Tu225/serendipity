import type { MapPlace } from "@/types/places";
import type { Recommendation } from "@/types/recommendations";

export const recommendationReasons = {
  friend: "Recommended by people you follow",
  similar_taste: "Loved by people with similar taste",
  explore: "Something new to you",
};

export function recommendationPlace(item: Recommendation): MapPlace {
  const { place, kind, score, logs } = item;
  const friend = logs.find((log) => log.relation === "following");
  return {
    source: "app", app_id: place.id, place_id: place.id, display_name: place.name,
    address: "", location: { latitude: place.lat, longitude: place.lng }, app_category: place.category,
    category: ["restaurant", "cafe", "bar"].includes(place.category) ? "Food"
      : ["trail", "park", "viewpoint", "gym", "climbing"].includes(place.category) ? "Outdoors" : "Culture",
    google_maps_uri: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
    attributions: [], recommendation: { kind, score, logs },
    friend: friend ? { id: friend.author.id, name: friend.author.display_name, note: "recommends this",
      review: friend.review ?? "" } : undefined,
  };
}
