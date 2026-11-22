import { expect, test, type Page } from "@playwright/test";
import { appPlaces, mockDiscovery, signedIn } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";
import type { MapBounds } from "../src/types/discovery";

const initial = { west: -81.3453, east: -81.1453, south: 42.8849, north: 43.0849 };
const east = { ...initial, west: initial.west + .12, east: initial.east + .12 };
const marker = (page: Page) => page.getByRole("button", { name: "View St. Lawrence Market", exact: true });
async function bounds(page: Page, value: MapBounds) {
  await page.evaluate((value) => (window as unknown as { __boundsTestMap: (bounds: MapBounds) => void }).__boundsTestMap(value), value);
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
}
test.beforeEach(async ({ page }) => { await mockGoogleMaps(page); await mockDiscovery(page); });

test("pagination adds pins without replacing earlier markers or caching an unfinished area", async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route("**/api/discovery/places?**", async (route) => {
    calls++;
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor) await blocked;
    return route.fulfill({ json: { places: cursor ? appPlaces.slice(1) : [appPlaces[0]], next_cursor: cursor ? null : appPlaces[0].id } });
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await expect.poll(() => calls).toBe(2);
  await bounds(page, { ...initial, west: initial.west + .02, east: initial.east + .02 });
  await page.waitForTimeout(350);
  expect(calls).toBe(2);
  release();
  await expect(page.getByLabel(/Serendipity rating:/)).toHaveCount(6);
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await bounds(page, initial);
  await page.waitForTimeout(350);
  expect(calls).toBe(2);
});

test("panning fetches only exposed strips, keeps overlapping markers, and reuses return trips", async ({ page }) => {
  const requests: MapBounds[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const added = { ...appPlaces[3], id: "new-east-place", name: "New eastern place", longitude: -81.04, latitude: 42.9849 };
  await page.route("**/api/discovery/places?**", async (route) => {
    const [west, south, east, north] = new URL(route.request().url()).searchParams.get("bbox")!.split(",").map(Number);
    requests.push({ west, south, east, north });
    if (requests.length > 1) await blocked;
    return route.fulfill({ json: { places: requests.length === 1 ? [appPlaces[0]] : [added], next_cursor: null } });
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
  await bounds(page, { ...initial, west: initial.west + .02, east: initial.east + .02 });
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  await bounds(page, east);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].west).toBeCloseTo(requests[0].east, 8);
  expect(requests[1].east).toBeGreaterThan(requests[0].east);
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
  await page.screenshot({ path: "test-results/discovery-background-pan.png" });
  release();
  await expect(page.getByRole("button", { name: "View New eastern place" })).toBeVisible();
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await bounds(page, initial);
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(2);
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
});

test("expired ratings update quietly in the same marker and click handlers see the new data", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/discovery/places?**", (route) => {
    calls++;
    const place = calls === 1 ? appPlaces[0] : { ...appPlaces[0], rating_summary: { average: 2.5, count: 24 } };
    return route.fulfill({ json: { places: [place], next_cursor: null } });
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBe(2);
  await expect(marker(page)).toContainText("2.5");
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
  await marker(page).click();
  await expect(page.getByRole("article")).toContainText("2.5/5 · 24 reviewers");
});

test("switching viewers clears friend labels and refetches without replacing the marker", async ({ page }) => {
  let guest = false;
  let calls = 0;
  await page.route("**/api/auth/me", (route) => guest
    ? route.fulfill({ status: 401, json: { detail: "Sign in to continue" } })
    : route.fulfill({ json: signedIn }));
  await page.route("**/api/discovery/places?**", (route) => {
    calls++;
    return route.fulfill({ json: { places: [guest ? { ...appPlaces[0], friend_count: 0, friends: [] } : appPlaces[0]], next_cursor: null } });
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  await expect(marker(page)).toContainText("Elena");
  const identity = await marker(page).getAttribute("data-marker-id");
  await marker(page).click();
  guest = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => calls).toBe(2);
  await expect(marker(page)).not.toContainText("Elena");
  await expect(page.getByRole("article")).not.toContainText("Elena recommends this");
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
});

test("background failure preserves pins and has no loading banner", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/discovery/places?**", (route) => ++calls === 1
    ? route.fulfill({ json: { places: [appPlaces[0]], next_cursor: null } })
    : route.fulfill({ status: 503, json: { detail: "Database is unavailable" } }));
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
  await bounds(page, east);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Database is unavailable");
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByText("Loading app-reviewed places…")).toHaveCount(0);
});

test("a late response from the previous viewer cannot restore old friend data", async ({ page }) => {
  await page.clock.install();
  let account = "first-viewer";
  let calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...signedIn, user: { ...signedIn.user, id: account } } }));
  await page.route("**/api/discovery/places?**", async (route) => {
    const number = ++calls;
    const place = account === "first-viewer" ? appPlaces[0] : { ...appPlaces[0], friends: [], friend_count: 0 };
    if (number === 2) await blocked;
    return route.fulfill({ json: { places: [place], next_cursor: null } });
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBe(2);
  account = "second-viewer";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => calls).toBe(3);
  await expect(marker(page)).not.toContainText("Elena");
  release();
  await page.waitForTimeout(350);
  await expect(marker(page)).not.toContainText("Elena");
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
});
