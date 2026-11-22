import { expect, test } from "@playwright/test";
import { appPlaces, mockDiscovery } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

test.beforeEach(async ({ page }) => { await mockGoogleMaps(page); await mockDiscovery(page); });

test("zoom and pan never request automatic Google nearby or all-database pins", async ({ page }) => {
  let forbidden = 0;
  for (const pattern of ["**/api/places/nearby?**", "**/api/discovery/places?**"]) {
    await page.route(pattern, (route) => { forbidden++; return route.fulfill({ json: { places: appPlaces } }); });
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByLabel(/Recommendation review rating:/)).toHaveCount(6);
  await page.evaluate(() => {
    const map = window as unknown as { __zoomTestMap: (n: number) => void; __panTestMap: (lat: number, lng: number) => void };
    map.__zoomTestMap(16); map.__panTestMap(43.7, -79.4);
  });
  await expect(page.getByText("No recommendations in this area yet.", { exact: false })).toBeVisible();
  expect(forbidden).toBe(0);
});

for (const failedLookup of [false, true]) {
  test(`explicit search keeps one temporary non-recommended marker (lookup failure: ${failedLookup})`, async ({ page }) => {
    await page.route("**/api/places/autocomplete?**", (route) => route.fulfill({ json: { suggestions: [{ place_id: "searched-cafe", primary_text: "Searched cafe", secondary_text: "London" }] } }));
    await page.route("**/api/places/searched-cafe?**", (route) => route.fulfill({ json: {
      place_id: "searched-cafe", display_name: "Searched cafe", location: { latitude: 42.987, longitude: -81.242 },
      address: "London, Ontario", google_maps_uri: "https://maps.google.com/", attributions: [],
    } }));
    if (failedLookup) await page.route("**/api/discovery/places/by-google-id/searched-cafe", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
    await page.goto("/");
    await page.getByRole("button", { name: "Discover", exact: true }).click();
    await page.getByRole("combobox").fill("Cafe");
    await page.getByRole("option").click();
    const marker = page.getByRole("button", { name: "View Searched cafe", exact: true });
    await expect(marker).toHaveCount(1);
    await expect(marker.getByLabel(/Recommendation review rating:/)).toHaveCount(0);
    await expect(page.getByRole("article")).toContainText(failedLookup ? "App reviews could not be checked" : "No Serendipity reviews yet");
    await page.getByRole("button", { name: "Close place preview" }).click();
    await expect(marker).toHaveCount(0);
  });
}
