import { expect, test, type Page } from "@playwright/test";
import { appPlaces, mockDiscovery, signedIn } from "./helpers/discovery";
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

test("loads every result page and refreshes the database query after map movement", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/discovery/places?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params.get("bbox")!);
    const cursor = params.get("cursor");
    return route.fulfill({ json: { places: cursor ? appPlaces.slice(3) : appPlaces.slice(0, 3), next_cursor: cursor ? null : appPlaces[2].id } });
  });
  await open(page);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  expect(requests).toHaveLength(2);
  await bounds(page, { west: -75, south: 44, east: -74, north: 45 });
  await expect.poll(() => requests.filter((bbox) => bbox === "-75.25,43.75,-73.75,45.25").length).toBe(2);
});

test("superseded viewport responses never overwrite the latest area", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  let oldRequested = false;
  await page.route("**/api/discovery/places?**", async (route) => {
    const bbox = new URL(route.request().url()).searchParams.get("bbox");
    if (bbox === "-75.25,43.75,-73.75,45.25") {
      oldRequested = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ json: { places: appPlaces, next_cursor: null } });
    }
    return route.fulfill({ json: { places: [], next_cursor: null } });
  });
  await bounds(page, { west: -75, south: 44, east: -74, north: 45 });
  await expect.poll(() => oldRequested).toBe(true);
  await bounds(page, { west: -73, south: 44, east: -72, north: 45 });
  await expect(page.getByText("No app reviews in this area yet.", { exact: false })).toBeVisible();
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(0);
});

test("date-line viewports query two rectangles and deduplicate shared places", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  const requests: string[] = [];
  await page.route("**/api/discovery/places?**", (route) => {
    requests.push(new URL(route.request().url()).searchParams.get("bbox")!);
    return route.fulfill({ json: { places: [{ ...appPlaces[0], latitude: 0, longitude: 175 }], next_cursor: null } });
  });
  await bounds(page, { west: 170, south: -10, east: -170, north: 10 });
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual(["165,-15,180,15", "-180,-15,-165,15"]);
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(1);
});

test("database failure offers retry without inserting demo places", async ({ page }) => {
  let failed = true;
  await page.route("**/api/discovery/places?**", (route) => failed
    ? route.fulfill({ status: 503, json: { detail: "Database is unavailable" } })
    : route.fulfill({ json: { places: [], next_cursor: null } }));
  await open(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Database is unavailable");
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Reload places" }).click();
  await expect(page.getByText("No app reviews in this area yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("combobox")).toBeEnabled();
});

test("dense places cluster and can be expanded", async ({ page }) => {
  const dense = appPlaces.slice(0, 3).map((place, index) => ({ ...place, latitude: 42.9849 + index * .00001, longitude: -81.2453 }));
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: dense, next_cursor: null } }));
  await open(page);
  await expect(page.getByRole("button", { name: "Zoom to 3 places" })).toBeVisible();
  await page.getByRole("button", { name: "Zoom to 3 places" }).click();
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-bounds", /42\.984/);
  await page.evaluate(() => (window as unknown as { __zoomTestMap: (zoom: number) => void }).__zoomTestMap(18));
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(3);
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

test("signed-out visitors browse reviews but are asked to sign in before writing", async ({ page }) => {
  await choosePlace(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Sign in to review" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Share experience" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("article")).toContainText("Go early, grab something warm");
});

test("review submission sends CSRF, preserves errors, and refreshes ratings only on success", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: signedIn }));
  let fail = true;
  let posted = false;
  const updated = { ...appPlaces[0], rating_summary: { average: 4.5, count: 24 } };
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: posted ? [updated] : appPlaces, next_cursor: null } }));
  await page.route("**/api/discovery/experiences", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("review-csrf");
    expect(route.request().postDataJSON()).toMatchObject({ place_id: appPlaces[0].id, rating: 4.5, review: "Great lunch", verdict: "recommend" });
    expect(route.request().postDataJSON()).not.toHaveProperty("user_id");
    if (fail) return route.fulfill({ status: 503, json: { detail: "Database is unavailable" } });
    posted = true;
    return route.fulfill({ status: 201, json: { place: updated, experiences: [], next_offset: null } });
  });
  await choosePlace(page);
  const markerId = await page.getByRole("button", { name: "View St. Lawrence Market", exact: true }).getAttribute("data-marker-id");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Date visited")).toHaveCount(0);
  await dialog.getByLabel("How was it?").selectOption("recommend");
  await expect(dialog.getByLabel("Date visited")).toBeVisible();
  await expect(dialog.getByLabel("Your rating")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("Your rating").selectOption("4.5");
  await expect(dialog.getByLabel("Your review")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Continue" }).click();
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
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toHaveAttribute("data-marker-id", markerId!);
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
  await page.getByRole("button", { name: "Use map center" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Add to a list").selectOption("restaurant");
  await expect(dialog.getByLabel("Place name")).toHaveCount(0);
  await dialog.getByLabel("How was it?").selectOption("neutral");
  await dialog.getByLabel("Place name").fill("My neighborhood restaurant");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("Your review").fill("A lovely dinner.");
  await dialog.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)); });
  await page.screenshot({ path: "test-results/review-mobile.png" });
  await dialog.getByRole("button", { name: "Share experience" }).click();
  await expect.poll(() => received).toBe(true);
  await expect(dialog).toHaveCount(0);
});
