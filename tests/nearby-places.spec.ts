import { expect, test, type Page } from "@playwright/test";
import { mockDiscovery, appPlaces } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";
import { nearbyCells } from "../src/lib/maps/nearby-places";

const view = { west: -81.25, east: -81.24, south: 42.98, north: 42.99 };
const nearby = {
  place_id: "new-cafe", display_name: "Nearby cafe", address: "London, Ontario",
  location: { latitude: 42.987, longitude: -81.242 },
  google_maps_uri: "https://maps.google.com/?cid=123", attributions: [], types: ["cafe", "food"],
};
async function move(page: Page, bounds = view) {
  await page.evaluate((value) => {
    const map = window as unknown as { __boundsTestMap: (b: typeof view) => void; __zoomTestMap: (zoom: number) => void };
    map.__zoomTestMap(16); map.__boundsTestMap(value);
  }, bounds);
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
  await move(page);
}
test.beforeEach(async ({ page }) => { await mockGoogleMaps(page); await mockDiscovery(page); });

test("custom nearby pins have no fabricated rating, resolve on tap, and stay mounted during small pans", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/places/nearby?**", (route) => { calls++; return route.fulfill({ json: { places: [nearby] } }); });
  await open(page);
  const marker = page.getByRole("button", { name: "View Nearby cafe", exact: true });
  await expect(marker).toBeVisible();
  await expect(marker.locator(".discovery-pin")).toHaveClass(/is-unreviewed/);
  await expect(marker.locator(".discovery-pin-rating")).toHaveCount(0);
  const identity = await marker.getAttribute("data-marker-id");
  await expect.poll(() => calls).toBe(nearbyCells([view]).length);
  const count = calls;
  await move(page, { ...view, west: view.west + .0001, east: view.east + .0001 });
  await page.waitForTimeout(700);
  expect(calls).toBe(count);
  await expect(marker).toHaveAttribute("data-marker-id", identity!);
  await marker.click();
  await expect(page.getByRole("article")).toContainText("No Serendipity reviews yet");
  await page.getByRole("button", { name: "Write a review", exact: true }).click();
  await page.getByRole("button", { name: "Use map center", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in to review", exact: true })).toBeVisible();
});

test("app identity takes precedence over duplicate Google results", async ({ page }) => {
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: [{ ...appPlaces[0], google_place_id: nearby.place_id }], next_cursor: null } }));
  await page.route("**/api/places/nearby?**", (route) => route.fulfill({ json: { places: [nearby] } }));
  await open(page);
  await page.waitForTimeout(800);
  await expect(page.getByRole("button", { name: "View Nearby cafe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toContainText("4.7");
});

test("provider failure preserves reviewed pins and retry loads nearby places", async ({ page }) => {
  let failing = true;
  await page.route("**/api/places/nearby?**", (route) => failing
    ? route.fulfill({ status: 503, json: { detail: "Unavailable" } })
    : route.fulfill({ json: { places: [nearby] } }));
  await open(page);
  await expect(page.getByText(/Nearby places couldn’t load/)).toBeVisible();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry nearby places" }).click();
  await expect(page.getByRole("button", { name: "View Nearby cafe", exact: true })).toBeVisible();
});

test("search cells are bounded at world scale, handle date line and poles", () => {
  expect(nearbyCells([{ west: -180, east: 180, south: -85, north: 85 }])).toEqual([]);
  const cells = nearbyCells([{ west: 179.999, east: 180, south: 0, north: .001 }, { west: -180, east: -179.999, south: 0, north: .001 }]);
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) expect(cell.radius).toBeLessThanOrEqual(5000);
  for (const cell of nearbyCells([{ west: 0, east: .001, south: 89, north: 90 }])) expect(cell.radius).toBeGreaterThanOrEqual(50);
});

test("expired nearby results refresh quietly without replacing existing markers", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  let refresh = false;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/places/nearby?**", async (route) => {
    calls++;
    if (refresh) await blocked;
    return route.fulfill({ json: { places: [{ ...nearby, display_name: refresh ? "Updated nearby cafe" : nearby.display_name }] } });
  });
  await open(page);
  const marker = page.getByRole("button", { name: "View Nearby cafe", exact: true });
  await expect(marker).toBeVisible();
  await expect.poll(() => calls).toBe(nearbyCells([view]).length);
  const identity = await marker.getAttribute("data-marker-id");
  const before = calls;
  refresh = true;
  await page.clock.fastForward(301_000);
  await expect.poll(() => calls).toBeGreaterThan(before);
  await expect(marker).toHaveAttribute("data-marker-id", identity!);
  release();
  await expect(page.getByRole("button", { name: "View Updated nearby cafe", exact: true })).toHaveAttribute("data-marker-id", identity!);
});

test("database lookup failure never claims that a nearby place has no reviews", async ({ page }) => {
  await page.route("**/api/places/nearby?**", (route) => route.fulfill({ json: { places: [nearby] } }));
  await page.route("**/api/discovery/places/by-google-id/**", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await open(page);
  await page.getByRole("button", { name: "View Nearby cafe", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("App reviews could not be checked");
  await expect(page.getByText("No Serendipity reviews yet.", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: "test-results/nearby-custom-markers.png" });
});
