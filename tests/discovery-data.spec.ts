import { expect, test, type Page } from "@playwright/test";
import { appPlaces, mockDiscovery, recommendation, signedIn } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";
import type { MapBounds } from "../src/types/discovery";

test.beforeEach(async ({ page }) => { await mockGoogleMaps(page); await mockDiscovery(page); });

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
}
async function choosePlace(page: Page) {
  await open(page);
  await page.getByRole("button", { name: "View St. Lawrence Market", exact: true }).click();
  await page.getByRole("button", { name: "Write a review", exact: true }).click();
}
async function bounds(page: Page, value: MapBounds) {
  await page.evaluate((value) => (window as unknown as { __boundsTestMap: (bounds: MapBounds) => void }).__boundsTestMap(value), value);
}

test("recommendation responses highlight the original reviewed places without duplicate pins", async ({ page }) => {
  let databaseLists = 0, nearbyLists = 0, details = 0;
  const requests: string[] = [];
  await page.route("**/api/discovery/places?**", (route) => { databaseLists++; return route.fulfill({ json: { places: appPlaces, next_cursor: null } }); });
  await page.route("**/api/places/nearby?**", (route) => { nearbyLists++; return route.fulfill({ json: { places: [] } }); });
  await page.route("**/api/recommendations?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("limit") === "12") return route.fulfill({ json: { items: [] } });
    requests.push(params.get("bbox")!);
    expect(params.get("limit")).toBe("30");
    return route.fulfill({ json: { items: [recommendation(appPlaces[0]), recommendation(appPlaces[3], 3)] } });
  });
  page.on("request", (request) => { if (/\/discovery\/places\/[^/?]+\?/.test(request.url())) details++; });
  await open(page);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  await expect(page.getByRole("button", { name: "View Art Gallery of Ontario", exact: true }).locator(".discovery-pin")).toHaveAttribute("data-layer", "friend");
  expect(requests).toHaveLength(1);
  requests[0].split(",").map(Number).forEach((coordinate, i) => expect(coordinate).toBeCloseTo([-81.3953,42.8349,-81.0953,43.1349][i], 7));
  expect(databaseLists).toBeGreaterThan(0);
  await expect.poll(() => nearbyLists).toBeGreaterThan(0);
  expect(nearbyLists).toBeLessThanOrEqual(18); expect(details).toBe(0);
});

test("superseded viewport responses never overwrite the latest recommendations", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  let oldRequested = false;
  await page.route("**/api/recommendations?**", async (route) => {
    const bbox = new URL(route.request().url()).searchParams.get("bbox");
    if (Number(bbox?.split(",")[0]) === -75.25) {
      oldRequested = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ json: { items: [recommendation({ ...appPlaces[0], longitude: -72.5, latitude: 44.5 })] } });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await bounds(page, { west: -75, south: 44, east: -74, north: 45 });
  await expect.poll(() => oldRequested).toBe(true);
  await bounds(page, { west: -73, south: 44, east: -72, north: 45 });
  await expect(page.getByText("Zoom in to discover nearby places, or search for a destination.")).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByLabel(/Recommendation review rating:/)).toHaveCount(0);
});

test("date-line viewports query two recommendation rectangles and deduplicate", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  const requests: string[] = [];
  await page.route("**/api/recommendations?**", (route) => {
    requests.push(new URL(route.request().url()).searchParams.get("bbox")!);
    return route.fulfill({ json: { items: [recommendation({ ...appPlaces[0], latitude: 0, longitude: 175 })] } });
  });
  await bounds(page, { west: 170, south: -10, east: -170, north: 10 });
  await expect.poll(() => requests.length).toBe(2);
  expect(new Set(requests)).toEqual(new Set(["165,-15,180,15", "-180,-15,-165,15"]));
  await expect(page.getByLabel(/Recommendation review rating:/)).toHaveCount(1);
});

test("recommendation failure and empty results keep the original review layer available", async ({ page }) => {
  let failed = true;
  await page.route("**/api/recommendations?**", (route) => failed
    ? route.fulfill({ status: 503, json: { detail: "Recommendations are unavailable" } })
    : route.fulfill({ json: { items: [] } }));
  await open(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Recommendations are unavailable");
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  failed = false;
  await page.getByRole("button", { name: "Reload recommendations" }).click();
  await expect(page.locator('.discovery-pin[data-layer="review"]')).toHaveCount(3);
  await expect(page.locator('.discovery-pin[data-layer="friend"]')).toHaveCount(3);
  await expect(page.locator('.discovery-pin[data-layer="recommendation"]')).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeEnabled();
});

test("dense recommendations cluster and can be expanded", async ({ page }) => {
  const dense = appPlaces.slice(0, 3).map((place, index) => recommendation({ ...place, latitude: 42.9849 + index * .00001, longitude: -81.2453 }));
  await page.route("**/api/recommendations?**", (route) => route.fulfill({ json: { items: dense } }));
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: [], next_cursor: null } }));
  await open(page);
  await expect(page.getByRole("button", { name: "Zoom to 3 places" })).toBeVisible();
  await page.getByRole("button", { name: "Zoom to 3 places" }).click();
  await page.evaluate(() => (window as unknown as { __zoomTestMap: (zoom: number) => void }).__zoomTestMap(18));
  await expect(page.getByLabel(/Recommendation review rating:/)).toHaveCount(3);
});

test("a Google search matching an app identity shows its actual reviews once", async ({ page }) => {
  const place = { ...appPlaces[0], google_place_id: "google-market" };
  await page.route("**/api/places/autocomplete?**", (route) => route.fulfill({ json: { suggestions: [{ place_id: "google-market", primary_text: "Market", secondary_text: "Toronto" }] } }));
  await page.route("**/api/places/google-market?**", (route) => route.fulfill({ json: { place_id: "google-market", display_name: "Google Market", location: { latitude: place.latitude, longitude: place.longitude }, address: "Toronto", google_maps_uri: "https://maps.google.com/", attributions: [] } }));
  await page.route("**/api/discovery/places/by-google-id/google-market", (route) => route.fulfill({ json: place }));
  await open(page);
  await page.getByRole("combobox").fill("Market");
  await page.getByRole("option").click();
  await expect(page.getByRole("article")).toContainText("St. Lawrence Market");
  await expect(page.getByRole("article")).toContainText("23 reviews");
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "View Google Market", exact: true })).toHaveCount(0);
});

test("signed-out visitors are redirected before they can browse or write", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: { detail: "Sign in to continue" } }));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in / Sign up" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Discover places" })).toHaveCount(0);
});

test("review submission preserves errors and refetches recommendation eligibility after success", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: signedIn }));
  let fail = true;
  let posted = false;
  const updated = { ...appPlaces[0], rating_summary: { average: 4.5, count: 24 } };
  let recommendationCalls = 0;
  await page.route("**/api/recommendations?**", (route) => {
    recommendationCalls++;
    return route.fulfill({ json: { items: (posted ? appPlaces.slice(1) : appPlaces).map(recommendation) } });
  });
  await page.route("**/api/discovery/experiences", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("review-csrf");
    expect(route.request().postDataJSON()).toMatchObject({ place_id: appPlaces[0].id, rating: 4.5, review: "Great lunch", verdict: "recommend" });
    expect(route.request().postDataJSON()).not.toHaveProperty("user_id");
    if (fail) return route.fulfill({ status: 503, json: { detail: "Database is unavailable" } });
    posted = true;
    return route.fulfill({ status: 201, json: { place: updated, experiences: [], next_offset: null } });
  });
  await choosePlace(page);
  const before = recommendationCalls;
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("How was it?").selectOption("recommend");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Your rating").selectOption("4.5");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Your review").fill("Great lunch");
  await dialog.getByRole("button", { name: "Share experience" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Database is unavailable");
  await expect(dialog.getByLabel("Your review")).toHaveValue("Great lunch");
  await expect(page.getByText("Your experience was shared", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: "test-results/review-error.png" });
  fail = false;
  await dialog.getByRole("button", { name: "Share experience" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article")).toContainText("4.5/5 · 24 reviews");
  await expect.poll(() => recommendationCalls).toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true }).locator(".discovery-pin")).toHaveAttribute("data-layer", "friend");
  await expect(page.getByText("Your experience was shared", { exact: false })).toBeVisible();
  await expect.poll(() => posted).toBe(true);
});

test("new-place review uses a chosen map point and a user-authored name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: signedIn }));
  let received = false;
  await page.route("**/api/discovery/experiences", (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.new_place).toEqual({ name: "My neighborhood restaurant", category: "restaurant", latitude: 42.9849, longitude: -81.2453 });
    expect(payload).not.toHaveProperty("place_id");
    received = true;
    return route.fulfill({ status: 201, json: { place: { ...appPlaces[0], id: "new-place", name: payload.new_place.name }, experiences: [], next_offset: null } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add a post" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Business name")).toHaveValue("");
  await dialog.getByRole("button", { name: "Select location", exact: true }).click();
  await page.getByRole("button", { name: "Use map center" }).click();
  await expect(dialog.getByRole("button", { name: "Change location", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("How was it?")).toHaveCount(0);
  await dialog.getByLabel("Add to a list").selectOption("restaurant");
  await expect(dialog.getByLabel("Place name")).toHaveCount(0);
  await dialog.getByLabel("How was it?").selectOption("recommend");
  await dialog.getByLabel("Place name").fill("My neighborhood restaurant");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await dialog.getByLabel("Your review").fill("A lovely dinner.");
  await dialog.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
  await page.screenshot({ path: "test-results/review-mobile.png" });
  await dialog.getByRole("button", { name: "Share experience" }).click();
  await expect.poll(() => received).toBe(true);
  await expect(dialog).toHaveCount(0);
});
