import { expect, test } from "@playwright/test";
import { mockDiscovery } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

test.beforeEach(async ({ page }) => { await mockGoogleMaps(page); await mockDiscovery(page); });

test("empty recommendations leave the original reviewed map visible", async ({ page }) => {
  await page.route("**/api/recommendations?**", (route) => route.fulfill({ json: { items: [] } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.locator('.discovery-pin[data-layer="review"]')).toHaveCount(3);
  await expect(page.locator('.discovery-pin[data-layer="friend"]')).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Map marker colours" })).toHaveCount(0);
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
