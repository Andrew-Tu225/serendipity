import { expect, test } from "@playwright/test";
import { visibleNearbyPins, visiblePinLabels } from "../src/lib/maps/declutter";
import { appPlaces, mockDiscovery, recommendation } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

test("grey overlap selection keeps existing pins and has clearance before revealing hidden pins", () => {
  const pin = { id: 1, x: 0, y: 0, width: 130, height: 62, visible: true };
  const other = { ...pin, id: 2, x: 135, visible: false };
  expect([...visibleNearbyPins([other, pin], [])]).toEqual([1]);
  expect([...visibleNearbyPins([{ ...other, x: 141 }, pin], [])]).toEqual([1, 2]);
  expect([...visibleNearbyPins([{ ...other, x: 141, visible: true }, pin], [])]).toEqual([1, 2]);
  expect([...visibleNearbyPins([pin, { ...other, x: 135, visible: true }], [])]).toEqual([1, 2]);
  expect([...visibleNearbyPins([pin], [{ x: 0, y: 0, width: 54, height: 54 }])]).toEqual([]);
});

test("labels yield to higher-priority names and other icons while compact destinations stay visible", () => {
  const icons = [{ id: 1, x: 0, y: 0, width: 24, height: 24 }, { id: 2, x: 60, y: 0, width: 30, height: 30 }];
  const labels = icons.map((icon) => ({ ...icon, y: -44, width: 130, height: 22,
    visible: false, selected: false, priority: icon.id === 2 ? 30 : 1 }));
  expect([...visibleNearbyPins(icons.map((icon) => ({ ...icon, visible: true })), [])]).toEqual([1, 2]);
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
  await expect(page.getByText("Loading places and recommendations…")).toHaveCount(0);
  await page.waitForTimeout(350);
  await expect(page.getByRole("button", { name: `View ${reviews[0].name}`, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zoom to 2 places", exact: true })).toBeVisible();
  await expect(nearby).toHaveAttribute("data-marker-id", identity!);
});

test("nearby batches hide overlaps without redrawing reviews and hold visibility during motion", async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  await page.route("**/api/recommendations?**", route => route.fulfill({ json: { items: [] } }));
  const review = appPlaces[0];
  await page.route("**/api/discovery/places?**", route => route.fulfill({ json: { places: [review], next_cursor: null } }));
  const nearby = (id: string, latitude: number, longitude: number) => ({
    place_id: id, display_name: id, address: "London", location: { latitude, longitude },
    google_maps_uri: "https://maps.google.com/", attributions: [], types: ["park"],
  });
  let second!: () => void;
  const blocked = new Promise<void>(resolve => { second = resolve; });
  let calls = 0;
  await page.route("**/api/places/nearby?**", async route => {
    const batch = ++calls;
    if (batch > 1) await blocked;
    return route.fulfill({ json: { places: [
      nearby("Overlapping review", review.latitude, review.longitude),
      nearby("Keep grey", 42.989, -81.24),
      ...(batch > 1 ? [nearby("Overlapping grey", 42.989, -81.24)] : []),
    ] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: `View ${review.name}`, exact: true })).toBeVisible();
  await page.evaluate(() => {
    const map = window as unknown as { __zoomTestMap: (n: number) => void; __boundsTestMap: (b: object) => void };
    map.__zoomTestMap(16); map.__boundsTestMap({ west: -81.25, east: -81.24, south: 42.98, north: 42.99 });
  });
  const grey = page.getByRole("button", { name: "View Keep grey", exact: true });
  await expect(grey).toBeVisible();
  await expect(page.getByRole("button", { name: "View Overlapping review", exact: true })).toHaveCount(0);
  const stats = async () => {
    const rows = await page.evaluate(() => (window as unknown as { __markerTestStats: () => {title: string; id: string; attachments: number; detachments: number; visible: boolean}[] }).__markerTestStats());
    // Development Strict Mode mounts effects twice; compare the current instance for each Place.
    return [...new Map(rows.map(marker => [marker.title, marker])).values()];
  };
  const before = await stats();
  second();
  await expect.poll(async () => (await stats()).some(marker => marker.title === "View Overlapping grey")).toBe(true);
  await page.waitForTimeout(300);
  await expect(page.getByRole("button", { name: "View Overlapping grey", exact: true })).toHaveCount(0);
  const after = await stats();
  for (const title of [`View ${review.name}`, "View Keep grey"]) {
    expect(after.find(marker => marker.title === title)).toEqual(before.find(marker => marker.title === title));
  }
  // Zooming out creates an overlap, but cannot hide a pin until the camera settles.
  await page.evaluate(() => (window as unknown as { __movingTestMap: (zoom: number) => void }).__movingTestMap(11));
  await page.waitForTimeout(300);
  expect((await stats()).find(marker => marker.title === "View Keep grey")).toEqual(after.find(marker => marker.title === "View Keep grey"));
  await page.evaluate(() => (window as unknown as { __boundsTestMap: (bounds: object) => void }).__boundsTestMap({ west: -81.25, east: -81.24, south: 42.98, north: 42.99 }));
  await expect(grey).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __zoomTestMap: (zoom: number) => void }).__zoomTestMap(16));
  await expect(grey).toBeVisible();
  await expect(grey).toHaveAttribute("data-marker-id", before.find(marker => marker.title === "View Keep grey")!.id);
  await grey.focus(); await grey.press("Enter");
  await expect(grey).toHaveAttribute("data-priority", "1000");
  await page.getByRole("button", { name: "Close place preview" }).click();
  await expect(grey).toHaveAttribute("data-priority", "1");
});
