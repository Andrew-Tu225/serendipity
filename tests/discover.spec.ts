import { expect, test } from "@playwright/test";
import { mockGoogleMaps } from "./helpers/google-maps";

const suggestion = { place_id: "garden", primary_text: "A garden", secondary_text: "Toronto, ON" };
const details = {
  place_id: "garden", display_name: "A garden", address: "Toronto, ON",
  location: { latitude: 43.64, longitude: -79.39 },
  viewport: { low: { latitude: 43.63, longitude: -79.40 }, high: { latitude: 43.65, longitude: -79.38 } },
  google_maps_uri: "https://www.google.com/maps/search/?api=1&query=garden", attributions: [],
};

async function openDiscover(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
}

test("loads only on Discover, selects demo places, and preserves the map across tabs", async ({ page }) => {
  const loads = await mockGoogleMaps(page);
  await page.goto("/");
  expect(loads()).toBe(0);
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
  await expect(page.getByText("Toronto · Demo ratings & friends")).toBeVisible();
  await expect(page.getByRole("button", { name: "Map filters" })).toHaveCount(0);
  await page.getByRole("button", { name: "View St. Lawrence Market", exact: true }).click();
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText("Elena recommends this · Demo");
  await page.evaluate(() => {
    (window as unknown as Window & { __panTestMap: (lat: number, lng: number) => void }).__panTestMap(43.7, -79.4);
  });
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText("St. Lawrence Market");
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-center", JSON.stringify({ lat: 43.7, lng: -79.4 }));
  expect(loads()).toBe(1);
  await page.getByRole("button", { name: "Close place preview" }).click();
  await expect(page.getByRole("article", { name: "Selected place" })).toHaveCount(0);
});

test("search uses a session token, keyboard selection, and the result viewport", async ({ page }) => {
  await mockGoogleMaps(page);
  let token = "";
  await page.route("**/api/places/autocomplete?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    token = params.get("session_token")!;
    expect(params.get("latitude")).toBe(params.get("query") === "garden" ? "43.651" : "43.64");
    return route.fulfill({ json: { suggestions: [suggestion] } });
  });
  await page.route("**/api/places/garden?**", (route) => {
    expect(new URL(route.request().url()).searchParams.get("session_token")).toBe(token);
    return route.fulfill({ json: details });
  });
  await openDiscover(page);
  const input = page.getByRole("combobox", { name: "Search places" });
  await input.fill("garden");
  await expect(page.getByRole("option", { name: "A garden Toronto, ON" })).toBeVisible();
  await input.press("ArrowDown");
  await expect(page.getByRole("option")).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText("A garden");
  await expect(page.getByRole("article")).not.toContainText("Serendipity demo");
  await expect(page.getByRole("article")).not.toContainText("Elena");
  await expect(page.getByRole("button", { name: "View A garden", exact: true }).getByLabel(/Serendipity rating/)).toHaveCount(0);
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-bounds", JSON.stringify({ south: 43.63, west: -79.40, north: 43.65, east: -79.38 }));
  await expect(page.getByRole("button", { name: "View A garden", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  const firstToken = token;
  await input.fill("gard");
  await expect(page.getByRole("option")).toBeVisible();
  expect(token).not.toBe(firstToken);
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("search handles empty results, stale responses, and retriable errors", async ({ page }) => {
  await mockGoogleMaps(page);
  let calls = 0;
  await page.route("**/api/places/autocomplete?**", async (route) => {
    calls++;
    const query = new URL(route.request().url()).searchParams.get("query");
    if (query === "old") {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ json: { suggestions: [{ ...suggestion, primary_text: "Old result" }] } });
    }
    if (calls === 2) return route.fulfill({ status: 503, json: { detail: "Place search is unavailable. Please try again." } });
    return route.fulfill({ json: { suggestions: [] } });
  });
  await openDiscover(page);
  const input = page.getByRole("combobox");
  await input.fill("old");
  await expect.poll(() => calls).toBe(1);
  await input.fill("new");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Place search is unavailable");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No places found. Try another name.")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("location is requested only on tap and recenters the map", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 43.7, longitude: -79.42 });
  await mockGoogleMaps(page);
  await openDiscover(page);
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-center", JSON.stringify({ lat: 43.651, lng: -79.386 }));
  await page.getByRole("button", { name: "Center on my location" }).click();
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-center", JSON.stringify({ lat: 43.7, lng: -79.42 }));
  await expect(page.getByRole("button", { name: "Your location", exact: true })).toHaveCount(1);
});

test("location denial leaves the map and search usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_success: unknown, failure: () => void) => failure() } });
  });
  await mockGoogleMaps(page);
  await openDiscover(page);
  await page.getByRole("button", { name: "Center on my location" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("You can still search anywhere");
  await expect(page.getByRole("combobox")).toBeEnabled();
});

test("map loading failures can be retried", async ({ page }) => {
  await mockGoogleMaps(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("The map couldn’t load");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "View St. Lawrence Market", exact: true })).toBeVisible();
});

test("details failures recover and selecting another result replaces its marker", async ({ page }) => {
  await mockGoogleMaps(page);
  let fail = true;
  let selection = 0;
  await page.route("**/api/places/autocomplete?**", (route) => route.fulfill({ json: { suggestions: [suggestion] } }));
  await page.route("**/api/places/garden?**", (route) => {
    if (fail) return route.fulfill({ status: 503, json: { detail: "Place details are unavailable. Please try again." } });
    selection++;
    return route.fulfill({ json: { ...details, place_id: `garden-${selection}`, display_name: `Garden ${selection}`, viewport: null } });
  });
  await openDiscover(page);
  const input = page.getByRole("combobox");
  await input.fill("garden");
  await page.getByRole("option").click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Place details are unavailable");
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("option").click();
  await expect(page.getByRole("article")).toContainText("Garden 1");
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-zoom", "16");
  await input.fill("another garden");
  await page.getByRole("option").click();
  await expect(page.getByRole("article")).toContainText("Garden 2");
  await expect(page.getByRole("button", { name: "View Garden 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View Garden 2", exact: true })).toHaveCount(1);
});

test("leaving Discover cancels an unfinished place selection", async ({ page }) => {
  await mockGoogleMaps(page);
  let release!: () => void;
  let finish!: () => void;
  let requested = false;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  await page.route("**/api/places/autocomplete?**", (route) => route.fulfill({ json: { suggestions: [suggestion] } }));
  await page.route("**/api/places/garden?**", async (route) => {
    requested = true;
    await blocked;
    await route.fulfill({ json: details });
    finish();
  });
  await openDiscover(page);
  await page.getByRole("combobox").fill("garden");
  await page.getByRole("option").click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  release();
  await finished;
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("article", { name: "Selected place" })).toHaveCount(0);
  await expect(page.getByText("Opening place…")).toHaveCount(0);
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-center", JSON.stringify({ lat: 43.651, lng: -79.386 }));
});

test("Google authorization failures show a useful error", async ({ page }) => {
  await mockGoogleMaps(page);
  await openDiscover(page);
  await page.evaluate(() => {
    (window as unknown as { gm_authFailure: () => void }).gm_authFailure();
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Google Maps authorization failed");
});

test("app-rated demo places include friends’ reviews and community-only ratings", async ({ page }) => {
  await mockGoogleMaps(page);
  await openDiscover(page);
  await expect(page.getByLabel(/Demo Serendipity rating:/)).toHaveCount(6);
  await page.getByRole("button", { name: "View St. Lawrence Market", exact: true }).click();
  const preview = page.getByRole("article", { name: "Selected place" });
  await expect(preview).toContainText("4.7/5 · 23 reviews · Serendipity demo");
  await expect(preview).toContainText("Go early, grab something warm");
  await page.getByRole("button", { name: "Close place preview" }).click();
  await page.getByRole("button", { name: "View Trinity Bellwoods Park", exact: true }).click();
  await expect(preview).toContainText("4.4/5 · 31 reviews · Serendipity demo");
  await expect(preview.locator(".discovery-friend-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Close place preview" }).click();
  await page.getByRole("button", { name: "View Toronto Music Garden", exact: true }).click();
  await expect(preview).toContainText("Alex recommends this · Demo");
});

for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 844 }]) {
  test(`map fills the phone above navigation at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockGoogleMaps(page);
    await openDiscover(page);
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toHaveCount(0);
    const shell = await page.locator(".app-shell").boundingBox();
    const nav = await page.getByRole("navigation", { name: "Primary navigation" }).boundingBox();
    const map = await page.getByLabel("Interactive discovery map").boundingBox();
    const search = await page.getByRole("combobox").boundingBox();
    const locate = await page.getByRole("button", { name: "Center on my location" }).boundingBox();
    expect(map!.x).toBeCloseTo(shell!.x, 0);
    expect(map!.y).toBeCloseTo(shell!.y, 0);
    expect(map!.width).toBeCloseTo(shell!.width, 0);
    expect(map!.y + map!.height).toBeCloseTo(nav!.y, 0);
    expect(nav!.y + nav!.height).toBeCloseTo(shell!.y + shell!.height, 0);
    expect(search!.y).toBeGreaterThan(map!.y);
    expect(locate!.y).toBeGreaterThan(search!.y + search!.height);
    // An uncovered patch of map must receive input directly, without an overlay intercepting it.
    const uncovered = { x: map!.x + 5, y: map!.y + map!.height / 2 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("discovery-map"), uncovered)).toBe(true);
    await page.getByRole("button", { name: "View Art Gallery of Ontario", exact: true }).click();
    await expect(page.getByRole("article")).toBeVisible();
    const preview = await page.getByRole("article").boundingBox();
    const add = await page.getByRole("button", { name: "Add a post" }).boundingBox();
    const attribution = await page.getByLabel("Map attribution").boundingBox();
    expect(preview!.y).toBeGreaterThan(locate!.y + locate!.height);
    expect(preview!.y + preview!.height).toBeLessThan(attribution!.y);
    expect(preview!.y + preview!.height).toBeLessThan(add!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight)).toBe(false);
    await page.screenshot({ path: `test-results/discover-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What feels fun?" })).toBeVisible();
  });
}
