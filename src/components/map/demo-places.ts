import type { MapPlace } from "@/types/places";

// Independently authored illustrative data, not imported Google Places content.
const places = [
  { id: "market", name: "St. Lawrence Market", address: "93 Front Street East, Toronto", lat: 43.6487, lng: -79.3715, category: "Food", rating: 4.7, reviews: 23, friend: { name: "Elena", note: "recommends this", review: "Go early, grab something warm, and wander the stalls.", variant: "one" } },
  { id: "gallery", name: "Art Gallery of Ontario", address: "317 Dundas Street West, Toronto", lat: 43.6536, lng: -79.3925, category: "Culture", rating: 4.6, reviews: 18, friend: { name: "James", note: "reviewed this", review: "An easy place to lose an afternoon. Leave time for the upstairs galleries.", variant: "two" } },
  { id: "music-garden", name: "Toronto Music Garden", address: "479 Queens Quay West, Toronto", lat: 43.6375, lng: -79.3941, category: "Outdoors", rating: 4.8, reviews: 12, friend: { name: "Alex", note: "recommends this", review: "My favorite quiet waterfront walk, especially just before sunset.", variant: "three" } },
  { id: "trinity", name: "Trinity Bellwoods Park", address: "790 Queen Street West, Toronto", lat: 43.6476, lng: -79.4139, category: "Outdoors", rating: 4.4, reviews: 31 },
  { id: "distillery", name: "Distillery District", address: "55 Mill Street, Toronto", lat: 43.6503, lng: -79.3596, category: "Culture", rating: 4.3, reviews: 16 },
  { id: "kensington", name: "Kensington Market", address: "Kensington Avenue, Toronto", lat: 43.6545, lng: -79.4005, category: "Food", rating: 4.6, reviews: 27 },
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
  rating_summary: { average: place.rating, count: place.reviews },
  friend: "friend" in place ? place.friend : undefined,
}));
