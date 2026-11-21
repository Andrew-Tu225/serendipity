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
  await expect(page.getByText("Toronto · Demo friend activity")).toBeVisible();
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

for (const width of [390, 1280]) {
  test(`map and preview fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockGoogleMaps(page);
    await openDiscover(page);
    await page.getByRole("button", { name: "View Art Gallery of Ontario", exact: true }).click();
    await expect(page.getByRole("article")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const map = await page.getByLabel("Interactive discovery map").boundingBox();
    expect(map!.height).toBeGreaterThan(280);
    await page.screenshot({ path: `test-results/discover-${width}.png`, fullPage: true });
  });
}
