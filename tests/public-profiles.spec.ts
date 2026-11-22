import { expect, test, type Page } from "@playwright/test";
import { appPlaces, mockDiscovery, signedIn } from "./helpers/discovery";
import { mockGoogleMaps } from "./helpers/google-maps";

const profile = {
  id: "author-0", display_name: "Elena", avatar_url: null, character: null,
  experience_count: 2, follower_count: 3, following_count: 6,
  is_following: true, follows_you: true, is_self: false,
};
const experience = {
  id: "first-visit", author: profile, place: appPlaces[0], rating: 4.5,
  verdict: "recommend", review: "A lovely afternoon at the market.", visited_on: "2026-11-10", photo_urls: [],
};

test.beforeEach(async ({ page }) => {
  await mockGoogleMaps(page); await mockDiscovery(page);
  await page.route("**/api/users/author-0", route => route.fulfill({ json: profile }));
  await page.route("**/api/users/author-1", route => route.fulfill({ json: { ...profile, id: "author-1", display_name: "James" } }));
  await page.route("**/api/users/*/experiences?**", route => {
    const first = new URL(route.request().url()).searchParams.get("offset") === "0";
    return route.fulfill({ json: { items: [{ ...experience, id: first ? "first-visit" : "older-visit", review: first ? experience.review : "Another visit with friends." }], next_offset: first ? 1 : null } });
  });
  await page.route("**/api/users/*/followers?**", route => route.fulfill({ json: { items: [{ ...profile, id: "author-1", display_name: "James" }], next_offset: null } }));
  await page.route("**/api/users/*/following?**", route => route.fulfill({ json: { items: [], next_offset: null } }));
});

async function openFromMap(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await page.getByRole("button", { name: `View ${appPlaces[0].name}`, exact: true }).click();
  const author = page.getByRole("button", { name: "View profile of Elena", exact: true }).first();
  await author.click();
  return author;
}

test("opens a map reviewer's profile, paginates visits and restores map selection and focus", async ({ page }) => {
  const author = await openFromMap(page);
  await expect(page.getByRole("heading", { name: "Elena", exact: true }).first()).toBeVisible();
  await expect(page.getByText("You follow each other")).toBeVisible();
  await expect(page.getByText(experience.review, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More experiences", exact: true }).click();
  await expect(page.getByText("Another visit with friends.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText(appPlaces[0].name);
  await expect(author).toBeFocused();
});

test("browses nested friend profiles and returns to the previous list", async ({ page }) => {
  await openFromMap(page);
  await page.getByRole("button", { name: "3 Followers", exact: true }).click();
  const james = page.getByRole("button", { name: "View profile of James", exact: true });
  await james.click();
  await expect(page.getByRole("heading", { name: "James", exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(james).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "3 Followers", exact: true })).toBeFocused();
});

test("opens a profile's reviewed destination on the map", async ({ page }) => {
  await openFromMap(page);
  await page.getByRole("button", { name: `View ${appPlaces[0].name} on map`, exact: true }).click();
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText(appPlaces[0].name);
  await expect(page.getByLabel("Interactive discovery map")).toHaveAttribute("data-zoom", "16");
});

test("opens profiles from the viewer's Following list and preserves that list", async ({ page }) => {
  await page.route("**/api/profile/experiences?**", route => route.fulfill({ json: {
    user_id: "viewer", display_name: "Viewer", character: null, total: 0, follower_count: 6,
    following_count: 6, bookmark_count: 0, favorites: [], recent: [], next_offset: null,
  } }));
  await page.route("**/api/profile/connections/following?**", route => route.fulfill({ json: { people: [profile], next_offset: null } }));
  await page.goto("/"); await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Following", exact: true }).click();
  const author = page.getByRole("button", { name: "View profile of Elena", exact: true });
  await author.click();
  await expect(page.getByText("You follow each other")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(author).toBeFocused();
  await expect(page.getByRole("list", { name: "People you follow" })).toContainText("Elena");
});

test("recovers a failed profile request and handles a missing person", async ({ page }) => {
  let missing = true;
  await page.route("**/api/users/author-0", route => missing ? route.fulfill({ status: 404, json: { detail: "User not found" } }) : route.fulfill({ json: profile }));
  await openFromMap(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("This profile is no longer available.");
  missing = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("You follow each other")).toBeVisible();
});


test("switching accounts clears open profiles and cached navigation", async ({ page }) => {
  let viewerId = signedIn.user.id;
  await page.route("**/api/auth/me", route => route.fulfill({ json: { ...signedIn, user: { ...signedIn.user, id: viewerId } } }));
  await openFromMap(page);
  await expect(page.getByText("You follow each other")).toBeVisible();
  viewerId = "another-viewer";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("You follow each other")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});
