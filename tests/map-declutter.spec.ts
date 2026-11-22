import { expect, test } from "@playwright/test";
import { visiblePinLabels } from "../src/lib/maps/declutter";
import { appPlaces, mockDiscovery, recommendation } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

test("labels yield to higher-priority names and other icons while compact destinations stay visible", () => {
  const icons = [{ id: 1, x: 0, y: 0, width: 24, height: 24 }, { id: 2, x: 60, y: 0, width: 30, height: 30 }];
  const labels = icons.map((icon) => ({ ...icon, y: -44, width: 130, height: 22,
    visible: false, selected: false, priority: icon.id === 2 ? 30 : 1 }));
  expect([...visiblePinLabels(labels, icons)]).toEqual([2]);
  expect([...visiblePinLabels([{ ...labels[0], selected: true, priority: 1000 }, labels[1]], icons)]).toEqual([1]);
  expect([...visiblePinLabels([{ ...labels[0], y: -8 }], icons)]).toEqual([]);
});

test("compact nearby icons survive overlapping names and selection reveals the full destination", async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: [], next_cursor: null } }));
  await page.route("**/api/recommendations?**", (route) => route.fulfill({ json: { items: [] } }));
  const names = ["A long neighbourhood cafe name", "Another neighbourhood cafe name"];
  await page.route("**/api/places/nearby?**", (route) => route.fulfill({ json: { places: names.map((name, i) => ({
    place_id: `compact-${i}`, display_name: name, address: "London",
    location: { latitude: 42.985, longitude: -81.25 + i * .0003 },
    google_maps_uri: "https://maps.google.com/", attributions: [], types: ["cafe"],
  })) } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.evaluate(() => {
    const map = window as unknown as { __zoomTestMap: (n: number) => void; __boundsTestMap: (b: object) => void };
    map.__zoomTestMap(18); map.__boundsTestMap({ west: -81.251, east: -81.248, south: 42.984, north: 42.986 });
  });
  for (const name of names) await expect(page.getByRole("button", { name: `View ${name}`, exact: true })).toBeVisible();
  await expect(page.locator('.discovery-pin.has-label')).toHaveCount(1);
  const hiddenLabel = page.locator('.discovery-pin:not(.has-label)');
  const destination = await hiddenLabel.locator('.discovery-pin-label').textContent();
  await hiddenLabel.locator('..').focus();
  await hiddenLabel.locator('..').press("Enter");
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText(destination!);
  await expect(page.locator('.discovery-pin.is-selected .discovery-pin-caption')).toBeVisible();
  await expect(page.locator('.discovery-pin.has-label')).toHaveCount(1);
});

test("clustered-away reviews neither block nearby icons nor reappear when their layer changes", async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  const reviews = appPlaces.slice(0, 2).map((place, i) => ({ ...place, latitude: 42.985, longitude: -81.25 + i * .004 }));
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: reviews, next_cursor: null } }));
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/recommendations?**", async (route) => {
    await blocked;
    return route.fulfill({ json: { items: [recommendation(reviews[0])] } });
  });
  await page.route("**/api/places/nearby?**", (route) => route.fulfill({ json: { places: [{
    place_id: "beside-cluster", display_name: "Beside cluster", address: "London",
    location: { latitude: 42.985, longitude: -81.256 }, google_maps_uri: "https://maps.google.com/", attributions: [], types: ["park"],
  }] } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.evaluate(() => (window as unknown as { __boundsTestMap: (b: object) => void }).__boundsTestMap({ west: -81.26, east: -81.235, south: 42.98, north: 42.99 }));
  await expect(page.getByRole("button", { name: "Zoom to 2 places", exact: true })).toBeVisible();
  const nearby = page.getByRole("button", { name: "View Beside cluster", exact: true });
  await expect(nearby).toBeVisible();
  const identity = await nearby.getAttribute("data-marker-id");
  release();
  await expect(page.getByText("Loading places…", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(page.getByRole("button", { name: `View ${reviews[0].name}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zoom to 2 places", exact: true })).toBeVisible();
  await expect(nearby).toHaveAttribute("data-marker-id", identity!);
});

test("overlapping nearby places are represented in counts and retain identity when expanded", async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  await page.route("**/api/recommendations?**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/discovery/places?**", (route) => route.fulfill({ json: { places: [], next_cursor: null } }));
  const dense = Array.from({ length: 20 }, (_, i) => ({
    place_id: `dense-${i}`, display_name: `Dense destination ${i}`, address: "London",
    location: { latitude: 42.985 + Math.floor(i / 5) * .00005, longitude: -81.245 + i % 5 * .00005 },
    google_maps_uri: "https://maps.google.com/", attributions: [], types: ["cafe"],
  }));
  await page.route("**/api/places/nearby?**", (route) => route.fulfill({ json: { places: dense } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.evaluate(() => (window as unknown as { __boundsTestMap: (b: object) => void }).__boundsTestMap({ west: -81.25, east: -81.24, south: 42.98, north: 42.99 }));
  await expect(page.getByRole("button", { name: "Zoom to 20 places", exact: true })).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __markerTestStats: () => {title: string; id: string}[] }).__markerTestStats());
  const identities = new Map(before.filter((row) => row.title.startsWith("View Dense destination")).map((row) => [row.title, row.id]));
  expect(identities.size).toBe(20);
  await page.evaluate(() => (window as unknown as { __zoomTestMap: (n: number) => void }).__zoomTestMap(18));
  await expect(page.getByRole("button", { name: /^View Dense destination/ })).toHaveCount(20);
  for (const destination of dense) {
    await expect(page.getByRole("button", { name: `View ${destination.display_name}`, exact: true })).toHaveAttribute("data-marker-id", identities.get(`View ${destination.display_name}`)!);
  }
  const selected = page.getByRole("button", { name: "View Dense destination 0", exact: true });
  await selected.focus(); await selected.press("Enter");
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText("Dense destination 0");
  await page.getByRole("button", { name: "Close place preview" }).click();
  await expect(selected).toHaveAttribute("data-marker-id", identities.get("View Dense destination 0")!);
  await page.evaluate(() => (window as unknown as { __zoomTestMap: (n: number) => void }).__zoomTestMap(13));
  await expect(page.getByRole("button", { name: "Zoom to 20 places", exact: true })).toBeVisible();
});
