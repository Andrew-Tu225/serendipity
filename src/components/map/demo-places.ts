import type { MapPlace } from "@/types/places";

// Independently authored illustrative data, not imported Google Places content.
const places = [
  { id: "market", name: "St. Lawrence Market", address: "93 Front Street East, Toronto", lat: 43.6487, lng: -79.3715, category: "Food", friend: { name: "Elena", note: "recommends this", variant: "one" } },
  { id: "gallery", name: "Art Gallery of Ontario", address: "317 Dundas Street West, Toronto", lat: 43.6536, lng: -79.3925, category: "Culture", friend: { name: "James", note: "visited recently", variant: "two" } },
  { id: "music-garden", name: "Toronto Music Garden", address: "479 Queens Quay West, Toronto", lat: 43.6375, lng: -79.3941, category: "Outdoors", friend: { name: "Alex", note: "wants to go", variant: "three" } },
  { id: "trinity", name: "Trinity Bellwoods Park", address: "790 Queen Street West, Toronto", lat: 43.6476, lng: -79.4139, category: "Outdoors" },
  { id: "distillery", name: "Distillery District", address: "55 Mill Street, Toronto", lat: 43.6503, lng: -79.3596, category: "Culture" },
  { id: "kensington", name: "Kensington Market", address: "Kensington Avenue, Toronto", lat: 43.6545, lng: -79.4005, category: "Food" },
] as const;

export const demoPlaces: MapPlace[] = places.map((place) => ({
  place_id: `demo-${place.id}`,
  display_name: place.name,
  address: place.address,
  location: { latitude: place.lat, longitude: place.lng },
  google_maps_uri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.address}`)}`,
  attributions: [],
  source: "demo",
  category: place.category,
  friend: "friend" in place ? place.friend : undefined,
}));
