import { expect, test } from "@playwright/test";
import { appPlaces, mockDiscovery, recommendation } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

const area = { west: -81.25, east: -81.24, south: 42.98, north: 42.99 };
const places = appPlaces.slice(0, 3).map((place, i) => ({ ...place,
  latitude: 42.982 + i * .002, longitude: -81.248 + i * .002,
  google_place_id: i === 1 ? "linked-google-place" : null,
}));

test("white reviews and recommendation colours retain priority while all places share clustering", async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places, next_cursor: null } }));
  const friend = recommendation(places[0]);
  const personal = recommendation(places[1]); personal.kind = "similar_taste"; personal.logs[0].relation = "similar_taste";
  await page.route("**/api/recommendations?**", (route) => route.fulfill({ json: { items: [friend, personal] } }));
  const nearby = { place_id: "neutral-place", display_name: "Nearby park", address: "London",
    location: { latitude: 42.989, longitude: -81.249 }, google_maps_uri: "https://maps.google.com/", attributions: [], types: ["park"] };
  let nearbyCalls = 0;
  await page.route("**/api/places/nearby?**", (route) => { nearbyCalls++; return route.fulfill({ json: { places: [nearby,
    { ...nearby, place_id: "linked-google-place", display_name: "Duplicate Google place" },
  ] } }); });
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-zoom", /\d/);
  await page.evaluate((bounds) => {
    const map = window as unknown as { __zoomTestMap: (n: number) => void; __boundsTestMap: (b: typeof bounds) => void };
    map.__zoomTestMap(18); map.__boundsTestMap(bounds);
  }, area);
  const friendPin = page.getByRole("button", { name: `View ${places[0].name}`, exact: true }).locator(".discovery-pin");
  const personalPin = page.getByRole("button", { name: `View ${places[1].name}`, exact: true }).locator(".discovery-pin");
  const reviewPin = page.getByRole("button", { name: `View ${places[2].name}`, exact: true }).locator(".discovery-pin");
  const nearbyPin = page.getByRole("button", { name: "View Nearby park", exact: true }).locator(".discovery-pin");
  await expect(friendPin).toHaveAttribute("data-layer", "friend");
  await expect(personalPin).toHaveAttribute("data-layer", "recommendation");
  // A review by a followed user is still a review until the API recommends it.
  await expect(reviewPin).toHaveAttribute("data-layer", "review");
  await expect(nearbyPin).toHaveAttribute("data-layer", "place");
  await expect(page.getByRole("button", { name: "View Duplicate Google place", exact: true })).toHaveCount(0);
  expect(nearbyCalls).toBeGreaterThan(0);
  const colours = await Promise.all([friendPin, personalPin, reviewPin, nearbyPin].map((pin) => pin.locator('.discovery-pin-icon, .discovery-friend-avatar').evaluate((element) => getComputedStyle(element).backgroundColor)));
  expect(new Set(colours).size).toBe(4);
  expect(colours[2]).toBe("rgb(255, 255, 255)");
  const friendMarker = page.getByRole("button", { name: `View ${places[0].name}`, exact: true });
  const personalMarker = page.getByRole("button", { name: `View ${places[1].name}`, exact: true });
  const reviewMarker = page.getByRole("button", { name: `View ${places[2].name}`, exact: true });
  const nearbyMarker = page.getByRole("button", { name: "View Nearby park", exact: true });
  for (const marker of [nearbyMarker, friendMarker, personalMarker, reviewMarker]) await expect(marker).toHaveAttribute("data-collision-behavior", "always");
  await expect(friendMarker).toHaveAttribute("data-priority", "30");
  await expect(personalMarker).toHaveAttribute("data-priority", "20");
  await expect(reviewMarker).toHaveAttribute("data-priority", "10");
  await page.getByRole("button", { name: `View ${places[1].name}`, exact: true }).click();
  await expect(personalPin).toHaveClass(/is-selected/);
  expect(await personalPin.locator('.discovery-pin-icon').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(colours[1]);
  await expect(page.getByRole("group", { name: "Map marker colours" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close place preview" }).click();
  const identity = await nearbyMarker.getAttribute("data-marker-id");
  await nearbyMarker.focus(); await nearbyMarker.press("Enter");
  await expect(nearbyMarker).toHaveAttribute("data-collision-behavior", "always");
  await expect(nearbyMarker).toHaveAttribute("data-priority", "1000");
  await page.getByRole("button", { name: "Close place preview" }).click();
  await expect(nearbyMarker).toHaveAttribute("data-collision-behavior", "always");
  await expect(nearbyMarker).toHaveAttribute("data-priority", "1");
  await expect(nearbyMarker).toHaveAttribute("data-marker-id", identity!);
  await reviewMarker.focus(); await reviewMarker.press("Enter");
  expect(await reviewPin.locator('.discovery-pin-icon, .discovery-friend-avatar').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
  await page.screenshot({ path: "test-results/map-colour-layers-mobile.png", fullPage: true });
});
