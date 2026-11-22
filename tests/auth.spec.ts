import { expect, test } from "@playwright/test";
import { mockGoogleMaps } from "./helpers/google-maps";
import { appPlaces, mockDiscovery, signedIn } from "./helpers/discovery";

const profile = {
  user: { id: signedIn.user.id, display_name: "Alex Example", avatar_url: null },
  interests: ["cafe", "trail"], onboarding_completed_at: signedIn.user.onboarding_completed_at,
  experience_count: 2, saved_place_count: 3, following_count: 1,
};

async function mockProfile(page: import("@playwright/test").Page) {
  await page.route("**/api/me/profile", (route) => route.fulfill({ json: profile }));
}

test("signed-out visitors must log in before reaching home or onboarding", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: { detail: "Sign in to continue" } }));
  for (const path of ["/", "/onboarding", "/success"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  }
});

test("login starts full browser navigation through the API client", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: { detail: "Sign in to continue" } }));
  await page.route("**/api/auth/login", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Auth0 hosted login</h1>" }));
  await page.goto("/login?error=authentication_failed");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be verified");
  await page.getByRole("button", { name: "Sign in / Sign up" }).click();
  await expect(page).toHaveURL(/\/api\/auth\/login$/);
  await expect(page.getByRole("heading", { name: "Auth0 hosted login" })).toBeVisible();
});

test("first login requires interests, retries failed saves, then persists completion", async ({ page }) => {
  await mockDiscovery(page);
  let complete = false, fail = true;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    ...signedIn, user: { ...signedIn.user, display_name: "Alex Example", onboarding_completed_at: complete ? profile.onboarding_completed_at : null },
  } }));
  await page.route("**/api/me/onboarding", (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["x-csrf-token"]).toBe(signedIn.csrf_token);
    expect(route.request().postDataJSON()).toEqual({ interests: ["cafe", "trail"] });
    if (fail) return route.fulfill({ status: 503, json: { detail: "Database is unavailable" } });
    complete = true;
    return route.fulfill({ json: profile });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Welcome, Alex." })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/onboarding$/);
  const finish = page.getByRole("button", { name: "Continue", exact: true });
  await expect(finish).toBeDisabled();
  await expect(finish).toBeInViewport({ ratio: 1 });
  const cafe = page.getByRole("button", { name: "Cafés" });
  await cafe.focus();
  await cafe.press("Space");
  await expect(cafe).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Trails", exact: true }).click();
  await page.screenshot({ path: "test-results/onboarding-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await finish.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Database is unavailable");
  await expect(cafe).toHaveAttribute("aria-pressed", "true");
  fail = false;
  await finish.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Hello, Alex")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "What feels fun?" })).toBeVisible();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/$/);
});

test("returning users see real profile counts and can sign out with CSRF", async ({ page }) => {
  await mockDiscovery(page);
  await mockProfile(page);
  let loggedIn = true;
  await page.route("**/api/auth/me", (route) => loggedIn
    ? route.fulfill({ json: { ...signedIn, user: { ...signedIn.user, display_name: "Alex Example" } } })
    : route.fulfill({ status: 401, json: { detail: "Sign in to continue" } }));
  await page.route("**/api/auth/logout", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe(signedIn.csrf_token);
    loggedIn = false;
    await route.fulfill({ json: { logout_url: new URL("/login", page.url()).href } });
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alex Example", exact: true })).toBeVisible();
  await expect(page.locator(".account-avatar")).toHaveText("AE");
  await expect(page.locator(".profile-stats")).toHaveText("2Experiences3Saved places1Following");
  await expect(page.getByText("Cafés", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Mia");
  await expect(page.locator("body")).not.toContainText(signedIn.csrf_token);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/profile-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("new account profile has honest empty counts", async ({ page }) => {
  await mockDiscovery(page);
  await page.route("**/api/me/profile", (route) => route.fulfill({ json: { ...profile, experience_count: 0, saved_place_count: 0, following_count: 0 } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.locator(".profile-stats")).toHaveText("0Experiences0Saved places0Following");
  await expect(page.getByText("No Experiences yet.", { exact: false })).toBeVisible();
});

test("Home shows review-backed recommendations and opens the real Place on the map", async ({ page }) => {
  await mockGoogleMaps(page);
  await mockDiscovery(page);
  await page.route("**/api/recommendations?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("bbox")).toBe("-81.4,42.85,-81.1,43.12");
    expect(params.get("limit")).toBe("12");
    return route.fulfill({ json: { items: [{
      place: { id: appPlaces[0].id, name: appPlaces[0].name, lat: appPlaces[0].latitude, lng: appPlaces[0].longitude, category: "restaurant" },
      kind: "similar_taste", score: 1, logs: [{ experience_id: "review-1", author: { id: "a", display_name: "Cafe regular", avatar_url: null }, relation: "similar_taste", rating: 5, verdict: "recommend", review: "A lovely little spot", photo_urls: [], visited_on: "2026-11-01" }],
    }] } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "St. Lawrence Market" })).toBeVisible();
  await expect(page.getByText("A lovely little spot")).toBeVisible();
  await expect(page.getByText("Loved by people with similar taste")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/recommendations-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "View on map" }).click();
  await expect(page.getByRole("region", { name: "Discover places" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Selected place" })).toContainText("St. Lawrence Market");
});

test("recommendation failures retry and empty results invite map exploration", async ({ page }) => {
  await mockDiscovery(page);
  let fail = true;
  await page.route("**/api/recommendations?**", (route) => fail
    ? route.fulfill({ status: 503, json: { detail: "Database is unavailable" } })
    : route.fulfill({ json: { items: [] } }));
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Database is unavailable");
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Your next discovery is out there")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore the map" })).toBeVisible();
});

test("session service failures retry without showing personal content", async ({ page }) => {
  await mockDiscovery(page);
  let available = false;
  await page.route("**/api/auth/me", (route) => available
    ? route.fulfill({ json: signedIn })
    : route.fulfill({ status: 503, json: { detail: "Database is unavailable" } }));
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Database is unavailable");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "What feels fun?" })).toBeVisible();
});

test("expired session on a private request clears the app", async ({ page }) => {
  await mockDiscovery(page);
  let expired = false;
  await page.route("**/api/auth/me", (route) => expired
    ? route.fulfill({ status: 401, json: { detail: "Sign in to continue" } })
    : route.fulfill({ json: signedIn }));
  await page.route("**/api/me/profile", (route) => {
    expired = true;
    return route.fulfill({ status: 401, json: { detail: "Sign in to continue" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

for (const [width, height] of [[320, 568], [390, 844], [1280, 900]]) {
  test(`onboarding Continue stays visible before and after selecting interests at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
      ...signedIn, user: { ...signedIn.user, onboarding_completed_at: null },
    } }));
    await page.goto("/onboarding");
    const button = page.getByRole("button", { name: "Continue", exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(page.getByText("Choose at least one interest to continue.")).toBeVisible();
    await page.getByRole("button", { name: "Something else", exact: true }).click();
    await expect(button).toBeEnabled();
    await expect(button).toBeInViewport({ ratio: 1 });
    await expect(page.getByText("1 interest selected", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/onboarding-continue-${width}.png`, fullPage: true });
  });
}
