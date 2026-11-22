import { expect, test } from "@playwright/test";
import { appPlaces, mockDiscovery } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

const place = { ...appPlaces[0], google_place_id: "london-market" };
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="purple"/></svg>';

test.beforeEach(async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  await page.route("**/api/discovery/places?**", route => route.fulfill({ json: { places: [place], next_cursor: null } }));
  await page.route(/\/api\/discovery\/places\/00000000[^?]+\?/, route => route.fulfill({ json: { place, experiences: place.friends, next_offset: null } }));
  await page.route("https://lh3.googleusercontent.com/test-photo", route => route.fulfill({ contentType: "image/svg+xml", body: image }));
});

test("loads Google photos only for a selected place and shows credits", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/places/london-market/photo", route => {
    requests++;
    return route.fulfill({ json: { photo: { url: "https://lh3.googleusercontent.com/test-photo", authors: [{ display_name: "Local photographer", uri: "https://maps.google.com/author" }], google_maps_uri: "https://maps.google.com/photo", flag_content_uri: "https://maps.google.com/report" } } });
  });
  await page.goto("/"); await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("button", { name: `View ${place.name}`, exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: `View ${place.name}`, exact: true }).click();
  await expect(page.getByRole("img", { name: `Photo of ${place.name}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Local photographer" })).toHaveAttribute("href", "https://maps.google.com/author");
  await expect(page.getByRole("link", { name: "View original" })).toBeVisible();
  expect(requests).toBe(1);
});

test("photo failures leave reviews usable", async ({ page }) => {
  await page.route("**/api/places/london-market/photo", route => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.goto("/"); await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByRole("button", { name: `View ${place.name}`, exact: true }).click();
  await expect(page.getByRole("img", { name: `No photo available for ${place.name}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write a review" })).toBeEnabled();
  await expect(page.getByText(place.friends[0].review!,  { exact: true }).first()).toBeVisible();
});

test("review photos take precedence and a broken review photo falls back to Google", async ({ page }) => {
  let requests = 0;
  await page.route(/\/api\/discovery\/places\/00000000[^?]+\?/, route => route.fulfill({ json: { place, experiences: [{ ...place.friends[0], photo_urls: ["https://example.com/review-photo"] }], next_offset: null } }));
  await page.route("https://example.com/review-photo", route => route.fulfill({ status: 404, body: "missing" }));
  await page.route("**/api/places/london-market/photo", route => {
    requests++; return route.fulfill({ json: { photo: { url: "https://lh3.googleusercontent.com/test-photo", authors: [] } } });
  });
  await page.goto("/"); await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByRole("button", { name: `View ${place.name}`, exact: true }).click();
  await expect(page.getByRole("img", { name: `Photo of ${place.name}` })).toBeVisible();
  expect(requests).toBeGreaterThan(0);
});
