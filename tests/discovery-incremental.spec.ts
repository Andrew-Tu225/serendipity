import { expect, test, type Page } from "@playwright/test";
import { appPlaces, mockDiscovery, recommendation, signedIn } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";
import type { MapBounds } from "../src/types/discovery";

const initial = { west: -81.3453, east: -81.1453, south: 42.8849, north: 43.0849 };
const shifted = { ...initial, west: initial.west + .02, east: initial.east + .02 };
const marker = (page: Page) => page.getByRole("button", { name: "View St. Lawrence Market", exact: true });
async function bounds(page: Page, value: MapBounds) {
  await page.evaluate((value) => (window as unknown as { __boundsTestMap: (bounds: MapBounds) => void }).__boundsTestMap(value), value);
}
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
}
test.beforeEach(async ({ page }) => { await mockGoogleMaps(page); await mockDiscovery(page); });

async function ranked(page: Page, handler: (bbox: string) => Promise<unknown> | unknown) {
  await page.route("**/api/recommendations?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("limit") === "12") return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: await handler(params.get("bbox")!) });
  });
}

test("pan requests the full viewport, preserves shared markers, and caches exact return views", async ({ page }) => {
  const requests: string[] = [];
  await ranked(page, (bbox) => { requests.push(bbox); return { items: [recommendation(appPlaces[0])] }; });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await bounds(page, shifted);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toBe([shifted.west, shifted.south, shifted.east, shifted.north].join(","));
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await bounds(page, initial);
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(2);
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
});

test("a newly ranked response replaces the old set even if an old pin is selected", async ({ page }) => {
  let calls = 0;
  await ranked(page, () => ({ items: [recommendation(appPlaces[calls++ === 0 ? 0 : 1])] }));
  await open(page);
  await expect(marker(page)).toBeVisible();
  await marker(page).click();
  await bounds(page, shifted);
  await expect(page.getByRole("button", { name: "View Art Gallery of Ontario", exact: true })).toBeVisible();
  await expect(marker(page)).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Selected place" })).toBeVisible();
});

test("expired recommendation evidence updates quietly without replacing its marker", async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await ranked(page, () => {
    const item = recommendation(appPlaces[0]);
    if (++calls > 1) { item.logs[0].rating = 5; item.logs[0].review = "Fresh recommendation evidence"; }
    return { items: [item] };
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBe(2);
  await expect(marker(page)).toContainText("5.0");
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByText("Loading recommendations…")).toHaveCount(0);
  await marker(page).click();
  await expect(page.getByRole("article")).toContainText("Fresh recommendation evidence");
});

test("session expiration removes recommendation pins and returns to login", async ({ page }) => {
  let expired = false;
  await page.route("**/api/auth/me", (route) => expired
    ? route.fulfill({ status: 401, json: { detail: "Sign in to continue" } })
    : route.fulfill({ json: signedIn }));
  await open(page);
  await expect(marker(page)).toBeVisible();
  expired = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login$/);
  await expect(marker(page)).toHaveCount(0);
});

test("background recommendation failure preserves previous API pins without a loading banner", async ({ page }) => {
  let fail = false;
  await page.route("**/api/recommendations?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("limit") === "12") return route.fulfill({ json: { items: [] } });
    return fail ? route.fulfill({ status: 503, json: { detail: "Recommendations are unavailable" } })
      : route.fulfill({ json: { items: [recommendation(appPlaces[0])] } });
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  const identity = await marker(page).getAttribute("data-marker-id");
  fail = true;
  await bounds(page, shifted);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Recommendations are unavailable");
  await expect(marker(page)).toHaveAttribute("data-marker-id", identity!);
  await expect(page.getByText("Loading recommendations…")).toHaveCount(0);
});

test("a late response from another account cannot restore old recommendations", async ({ page }) => {
  await page.clock.install();
  let account = "first-viewer", calls = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...signedIn, user: { ...signedIn.user, id: account } } }));
  await ranked(page, async () => {
    const item = recommendation(appPlaces[account === "first-viewer" ? 0 : 1]);
    if (++calls === 2) await blocked;
    return { items: [item] };
  });
  await open(page);
  await expect(marker(page)).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBe(2);
  account = "second-viewer";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "What feels fun?" })).toBeVisible();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: "View Art Gallery of Ontario", exact: true })).toBeVisible();
  release();
  await page.waitForTimeout(350);
  await expect(marker(page)).toHaveCount(0);
});
