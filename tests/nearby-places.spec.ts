import { expect, test, type Page } from "@playwright/test";
import { mockDiscovery, appPlaces } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";
import { nearbyCells, NearbyRequestBudget, NEARBY_REQUESTS_PER_MINUTE, prioritizeNearbyCells } from "../src/lib/maps/nearby-places";

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

test("moving from seeded London to a city with no app reviews still shows Google nearby places", async ({ page }) => {
  const requests: number[] = [];
  await page.route("**/api/places/nearby?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const latitude = Number(params.get("latitude")), longitude = Number(params.get("longitude"));
    requests.push(longitude);
    return route.fulfill({ json: { places: [{ ...nearby, place_id: `area-${latitude}-${longitude}`,
      display_name: "Toronto destination", location: { latitude, longitude } }] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { __panTestMap: (lat: number, lng: number) => void }).__panTestMap(43.6532, -79.3832));
  await expect.poll(() => requests.some((longitude) => longitude > -80 && longitude < -79)).toBe(true);
  await expect(page.getByRole("button", { name: "View Toronto destination", exact: true }).first()).toBeVisible();
  await expect(page.locator('.discovery-pin[data-layer="review"], .discovery-pin[data-layer="friend"], .discovery-pin[data-layer="recommendation"]')).toHaveCount(0);
  await expect(page.getByText("No places in this area yet.", { exact: false })).toHaveCount(0);
});

test("custom nearby pins have no fabricated rating, resolve on tap, and stay mounted during small pans", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/places/nearby?**", (route) => { calls++; return route.fulfill({ json: { places: [nearby] } }); });
  await open(page);
  const marker = page.getByRole("button", { name: "View Nearby cafe", exact: true });
  await expect(marker).toBeVisible();
  await expect(marker.locator(".discovery-pin")).toHaveClass(/is-unreviewed/);
  await expect(marker.locator(".discovery-pin-rating")).toHaveCount(0);
  const identity = await marker.getAttribute("data-marker-id");
  await expect.poll(() => calls).toBe(nearbyCells([view], 16).length);
  const count = calls;
  await move(page, { ...view, west: view.west + .0001, east: view.east + .0001 });
  await page.waitForTimeout(700);
  expect(calls).toBe(count);
  await expect(marker).toHaveAttribute("data-marker-id", identity!);
  await marker.click();
  await expect(page.getByRole("article")).toContainText("No Serendipity reviews yet");
  await page.getByRole("button", { name: "Write a review", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Change location", exact: true }).click();
  await page.getByRole("button", { name: "Use this location", exact: true }).click();
  await expect(form.getByLabel("Business name")).toHaveValue("Nearby cafe");
  await form.getByLabel("Add to a list").selectOption("cafe");
  await expect(form.getByLabel("How was it?")).toBeVisible();
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
  await expect.poll(() => calls).toBe(nearbyCells([view], 16).length);
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

test("nearby searches run three at a time, prioritize the center, and never duplicate cells", async ({ page }) => {
  const area = { west: -81.29, east: -81.22, south: 42.96, north: 43.02 };
  const wanted = prioritizeNearbyCells(nearbyCells([area], 16), { latitude: 42.9849, longitude: -81.2453 });
  expect(wanted.length).toBeGreaterThan(3);
  const calls: string[] = [];
  const pointKey = (latitude: number, longitude: number) => `${latitude.toFixed(7)}:${longitude.toFixed(7)}`;
  const release: (() => void)[] = [];
  let unblocked = false;
  let running = 0, peak = 0;
  await page.route("**/api/places/nearby?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    calls.push(pointKey(Number(params.get("latitude")), Number(params.get("longitude"))));
    running++; peak = Math.max(peak, running);
    if (!unblocked) await new Promise<void>((resolve) => release.push(resolve));
    running--;
    return route.fulfill({ json: { places: [nearby] } });
  });
  await open(page);
  await move(page, area);
  await expect.poll(() => calls.length).toBe(3);
  expect(new Set(calls)).toEqual(new Set(wanted.slice(0, 3).map((cell) => pointKey(cell.center.latitude, cell.center.longitude))));
  await page.waitForTimeout(650);
  expect(calls).toHaveLength(3);
  release[0]();
  await expect.poll(() => calls.length).toBe(4);
  await expect(page.getByRole("button", { name: "View Nearby cafe", exact: true })).toBeVisible();
  unblocked = true;
  release.forEach((resolve) => resolve());
  await expect.poll(() => calls.length).toBe(wanted.length);
  expect(peak).toBe(3);
  expect(new Set(calls).size).toBe(wanted.length);
  await move(page, area);
  await page.waitForTimeout(650);
  expect(calls).toHaveLength(wanted.length);
});

test("zooming reuses sparse geographic responses instead of fetching every zoom band", async ({ page }) => {
  const radii: number[] = [];
  await page.route("**/api/places/nearby?**", (route) => {
    radii.push(Number(new URL(route.request().url()).searchParams.get("radius")));
    return route.fulfill({ json: { places: [nearby] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
  await page.evaluate((bounds) => (window as unknown as { __boundsTestMap: (value: typeof bounds) => void }).__boundsTestMap(bounds), view);
  const coarseCount = nearbyCells([view], 13).length;
  await expect.poll(() => radii.length).toBe(coarseCount);
  await move(page);
  await page.waitForTimeout(650);
  expect(radii).toHaveLength(coarseCount);
  await page.evaluate(() => (window as unknown as { __zoomTestMap: (zoom: number) => void }).__zoomTestMap(13));
  await page.waitForTimeout(650);
  expect(radii).toHaveLength(coarseCount);
});

test("request budget bounds attempts and releases slots at the rolling-minute boundary", () => {
  const budget = new NearbyRequestBudget();
  for (let index = 0; index < NEARBY_REQUESTS_PER_MINUTE; index++) expect(budget.take(1000 + index)).toBe(true);
  expect(budget.take(2000)).toBe(false);
  expect(budget.retryAt(2000)).toBe(61_000);
  expect(budget.take(61_000)).toBe(true);
  expect(budget.take(61_000)).toBe(false);
  const coarse = nearbyCells([view], 13), fine = nearbyCells([view], 16);
  expect(fine.length).toBeLessThanOrEqual(9);
  expect(fine).toEqual(coarse);
});

test("exploring new areas pauses at the request budget and resumes automatically", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/places/nearby?**", (route) => {
    calls++;
    return route.fulfill({ json: { places: [] } });
  });
  await open(page);
  await expect.poll(() => calls).toBe(nearbyCells([view], 16).length);
  let expected = calls;
  let index = 1;
  while (expected < NEARBY_REQUESTS_PER_MINUTE) {
    const area = { west: view.west + index * .4, east: view.east + index * .4, south: view.south, north: view.north };
    expected = Math.min(NEARBY_REQUESTS_PER_MINUTE, expected + nearbyCells([area], 16).length);
    await move(page, area);
    await page.clock.fastForward(600);
    await expect.poll(() => calls).toBe(expected);
    index++;
  }
  await move(page, { ...view, west: view.west + index * .4, east: view.east + index * .4 });
  await page.clock.fastForward(600);
  await expect(page.getByText("Nearby searches are paused briefly. More places will load automatically.")).toBeVisible();
  expect(calls).toBe(NEARBY_REQUESTS_PER_MINUTE);
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBeGreaterThan(NEARBY_REQUESTS_PER_MINUTE);
});

test("overlapping old cells cannot override a refreshed pin or its open preview", async ({ page }) => {
  await page.clock.install();
  let calls = 0, refreshing = false, unblocked = false;
  const release: (() => void)[] = [];
  await page.route("**/api/places/nearby?**", async (route) => {
    calls++;
    if (refreshing && !unblocked) await new Promise<void>((resolve) => release.push(resolve));
    return route.fulfill({ json: { places: [{ ...nearby, display_name: refreshing ? "Fresh cafe name" : nearby.display_name }] } });
  });
  await open(page);
  const marker = page.getByRole("button", { name: "View Nearby cafe", exact: true });
  await expect(marker).toBeVisible();
  await expect.poll(() => calls).toBe(nearbyCells([view], 16).length);
  const identity = await marker.getAttribute("data-marker-id");
  await marker.click();
  await expect(page.getByRole("article")).toContainText("Nearby cafe");
  refreshing = true;
  await page.clock.fastForward(301_000);
  await expect.poll(() => release.length).toBe(Math.min(3, nearbyCells([view]).length));
  await expect(marker).toHaveAttribute("data-marker-id", identity!);
  release[0]();
  const updated = page.getByRole("button", { name: "View Fresh cafe name", exact: true });
  await expect(updated).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByRole("article")).toContainText("Fresh cafe name");
  await expect(page.getByRole("button", { name: /^View (Nearby cafe|Fresh cafe name)$/, exact: true })).toHaveCount(1);
  unblocked = true;
  release.forEach((resolve) => resolve());
  await expect.poll(() => calls).toBe(2 * nearbyCells([view], 16).length);
  await expect(updated).toHaveAttribute("data-marker-id", identity!);
});

test("selection survives slow refreshes, zoom changes and failed nearby requests", async ({ page }) => {
  await page.clock.install();
  let refine = false;
  let fail!: () => void;
  const blocked = new Promise<void>((resolve) => { fail = resolve; });
  await page.route("**/api/places/nearby?**", async (route) => {
    if (refine) { await blocked; return route.fulfill({ status: 503, json: { detail: "Unavailable" } }); }
    return route.fulfill({ json: { places: [nearby] } });
  });
  await open(page);
  const marker = page.getByRole("button", { name: "View Nearby cafe", exact: true });
  await expect(marker).toBeVisible();
  const identity = await marker.getAttribute("data-marker-id");
  await marker.click();
  await expect(page.getByRole("article")).toContainText("No Serendipity reviews yet");
  refine = true;
  await page.clock.fastForward(301_000);
  await page.evaluate((bounds) => {
    const map = window as unknown as { __zoomTestMap: (zoom: number) => void; __boundsTestMap: (value: typeof bounds) => void };
    map.__zoomTestMap(17);
    map.__boundsTestMap(bounds);
  }, { west: -81.246, east: -81.240, south: 42.984, north: 42.989 });
  await page.clock.fastForward(650);
  await expect(marker).toHaveAttribute("data-marker-id", identity!);
  fail();
  await expect(page.getByText(/Nearby places couldn’t load/)).toBeVisible();
  await expect(marker).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByRole("article")).toContainText("Nearby cafe");
});
