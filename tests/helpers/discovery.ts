import type { Page } from "@playwright/test";
import type { Recommendation } from "../../src/types/recommendations";
import type { DiscoveryPlace } from "../../src/types/discovery";

const names = ["St. Lawrence Market", "Art Gallery of Ontario", "Toronto Music Garden", "Trinity Bellwoods Park", "Distillery District", "Kensington Market"];
export const appPlaces: DiscoveryPlace[] = names.map((name, index) => ({
  id: `00000000-0000-0000-0000-00000000000${index + 1}`, name,
  latitude: 42.9849 + index * .0125, longitude: -81.2453 + index * .0125,
  category: index % 3 === 0 ? "restaurant" : index % 3 === 1 ? "gallery" : "park",
  google_place_id: null, rating_summary: { average: [4.7, 4.6, 4.8, 4.4, 4.3, 4.6][index], count: [23, 18, 12, 31, 16, 27][index] },
  friend_count: index < 3 ? 1 : 0,
  friends: index < 3 ? [{
    id: `log-${index}`, author_id: `author-${index}`, author_name: ["Elena", "James", "Alex"][index],
    rating: 4.5, verdict: index === 1 ? "neutral" : "recommend", review: ["Go early, grab something warm, and wander the stalls.", "Leave time for the upstairs galleries.", "My favorite quiet waterfront walk."][index],
    visited_on: "2026-10-01", is_friend: true, is_self: false,
  }] : [],
}));

export const signedIn = {
  user: { id: "viewer", display_name: "Viewer", picture_url: null, onboarding_completed_at: "2026-11-22T12:00:00Z" }, auth0: {}, csrf_token: "review-csrf",
};

export function recommendation(place: DiscoveryPlace, index = 0): Recommendation {
  const friend = place.friends[0];
  return {
    place: { id: place.id, name: place.name, lat: place.latitude, lng: place.longitude, category: place.category },
    kind: friend ? "friend" : index % 2 ? "explore" : "similar_taste", score: friend ? 1 : .8,
    logs: [{ experience_id: friend?.id ?? `evidence-${place.id}`,
      author: { id: friend?.author_id ?? "community-user", display_name: friend?.author_name ?? "Community reviewer", avatar_url: null },
      relation: friend ? "following" : index % 2 ? "community" : "similar_taste", rating: 4.5,
      verdict: "recommend", review: friend?.review ?? "A wonderful place to discover.", photo_urls: [], visited_on: "2026-10-01" }],
  };
}

export async function mockDiscovery(page: Page) {
  await page.route("**/api/recommendations?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("limit") === "12") return route.fulfill({ json: { items: [] } });
    const [west, south, east, north] = params.get("bbox")!.split(",").map(Number);
    return route.fulfill({ json: { items: appPlaces.filter((place) => place.longitude >= west && place.longitude <= east && place.latitude >= south && place.latitude <= north).map(recommendation) } });
  });
  await page.route("**/api/places/nearby?**", (route) => route.fulfill({ json: { places: [] } }));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: signedIn }));
  await page.route("**/api/discovery/places?**", (route) => {
    const [west, south, east, north] = new URL(route.request().url()).searchParams.get("bbox")!.split(",").map(Number);
    return route.fulfill({ json: { places: appPlaces.filter((place) => place.longitude >= west && place.longitude <= east && place.latitude >= south && place.latitude <= north), next_cursor: null } });
  });
  await page.route("**/api/discovery/places/by-google-id/**", (route) => route.fulfill({ status: 404, json: { detail: "Place has no app record yet" } }));
  await page.route(/\/api\/discovery\/places\/00000000[^?]+\?/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const place = appPlaces.find((place) => place.id === id)!;
    return route.fulfill({ json: { place, experiences: place.friends, next_offset: null } });
  });
}
