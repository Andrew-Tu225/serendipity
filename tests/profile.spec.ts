import { expect, test } from "@playwright/test";

test("shows demo favorites in one row and expands the latest four ratings", async ({ page }) => {
  await page.setViewportSize({ width: 348, height: 820 });
  await page.route("**/api/profile/experiences?**", (route) => route.fulfill({ status: 401 }));
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();

  const favorites = page.getByRole("region", { name: "Top 4 experiences" });
  const cards = favorites.getByRole("listitem");
  await expect(cards).toHaveCount(4);
  await expect(cards).toContainText(["Violet Note", "Mend Studio", "Ridge Sunrise", "Sage Table"]);
  await expect(favorites.getByRole("list")).toBeVisible();
  const positions = await cards.evaluateAll((items) => items.map((item) => {
    const { top, left } = item.getBoundingClientRect();
    return { top, left };
  }));
  expect(new Set(positions.map((card) => card.top)).size).toBe(1);
  expect(positions[3].left).toBeGreaterThan(positions[0].left);

  const recent = page.getByRole("region", { name: "Last 4 rated" });
  await expect(recent.getByRole("listitem")).toContainText([
    "After-hours jazz", "Golden ridge hike", "Clay & rosé", "Rooftop supper",
  ]);
  await recent.getByRole("button", { name: "See all" }).click();
  const history = page.getByRole("region", { name: "All ratings" });
  await expect(history.getByRole("listitem")).toHaveCount(7);
  await history.getByRole("button", { name: "Show less" }).click();
  await expect(recent.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText(/flavor profile|experience energy/i)).toHaveCount(0);
});

test("uses the signed-in viewer's ratings and loads their older entries on demand", async ({ page }) => {
  const entry = {
    id: "first", place_name: "River Trail", category: "trail", rating: 4.5,
    verdict: "recommend", rated_on: "2026-10-18",
  };
  await page.route("**/api/profile/experiences?**", (route) => {
    const offset = new URL(route.request().url()).searchParams.get("offset");
    return route.fulfill({ json: {
      display_name: "Alex", total: 2, follower_count: 3, following_count: 5, bookmark_count: 1, favorites: [entry],
      recent: offset === "0" ? [entry] : [{ ...entry, id: "older", place_name: "Tea house" }],
      next_offset: offset === "0" ? 1 : null,
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Alex" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Top 4 experiences" }).getByText("River Trail")).toBeVisible();
  const recent = page.getByRole("region", { name: "Last 4 rated" });
  await expect(recent.getByText("4.5 out of 5")).toHaveCount(1);
  await recent.getByRole("button", { name: "See all" }).click();
  await expect(page.getByRole("region", { name: "All ratings" }).getByText("Tea house")).toBeVisible();
  await expect(page.getByText("Mia Morgan")).toHaveCount(0);
});

test("opens the lists screen and shows each saved place's name and location", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 790 });
  await page.route("**/api/profile/experiences?**", (route) => route.fulfill({ status: 401 }));
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByText("Followers", { exact: true })).toBeVisible();
  await expect(page.getByText("Following", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lists", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Lists", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Lists", exact: true })).toHaveCSS("display", "flex");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeHidden();
  await page.getByRole("button", { name: /Date-night spots/ }).click();
  await expect(page.getByRole("heading", { name: "Date-night spots" })).toBeFocused();
  const saved = page.getByRole("list", { name: "Saved places" });
  await expect(saved.getByRole("listitem")).toHaveCount(4);
  await expect(saved.getByRole("listitem").first()).toContainText("Violet Note");
  await expect(saved.getByRole("listitem").first()).toContainText("Lower East Side, Manhattan");
  await page.getByRole("button", { name: "Back to lists" }).click();
  await page.getByRole("button", { name: "Back to profile" }).click();
  await expect(page.getByRole("button", { name: "Lists", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Top 4 experiences" })).toBeVisible();
});

test("creates a demo list with a place and reads signed-in bookmarks from the API", async ({ page }) => {
  let signedIn = false;
  await page.route("**/api/profile/experiences?**", (route) => signedIn ? route.fulfill({ json: {
    display_name: "Alex", total: 0, follower_count: 2, following_count: 3, bookmark_count: 1,
    favorites: [], recent: [], next_offset: null,
  } }) : route.fulfill({ status: 401 }));
  await page.route("**/api/profile/bookmarks?**", (route) => route.fulfill({ json: {
    places: [{ id: "river", name: "River Trail", latitude: 43.1, longitude: -81.2 }], next_offset: null,
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Lists", exact: true }).click();
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByLabel("List name").fill("Sunday walks");
  await page.getByLabel("Place name").fill("Maple Lookout");
  await page.getByLabel("Location").fill("London, ON");
  await page.getByRole("button", { name: "Create list" }).click();
  await expect(page.getByRole("heading", { name: "Sunday walks" })).toBeVisible();
  await expect(page.getByText("London, ON")).toBeVisible();
  await page.getByRole("button", { name: "Back to lists" }).click();
  await expect(page.getByRole("button", { name: /Sunday walks/ })).toBeVisible();

  signedIn = true;
  await page.reload();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Lists", exact: true }).click();
  await page.getByRole("button", { name: /Saved places/ }).click();
  await expect(page.getByText("River Trail")).toBeVisible();
  await expect(page.getByText("43.1000° N, 81.2000° W")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open River Trail in Google Maps" })).toHaveAttribute(
    "href", "https://www.google.com/maps/search/?api=1&query=43.1%2C-81.2",
  );
});

test("opens both connection screens and focuses the matching profile stat when going back", async ({ page }) => {
  await page.route("**/api/profile/experiences?**", (route) => route.fulfill({ json: {
    display_name: "Mia", total: 0, follower_count: 2, following_count: 1, bookmark_count: 0,
    favorites: [], recent: [], next_offset: null,
  } }));
  await page.route("**/api/profile/connections/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/following")) {
      return route.fulfill({ json: {
        people: [{ id: "three", display_name: "Alex Bennett" }], next_offset: null,
      } });
    }
    const first = url.searchParams.get("offset") === "0";
    return route.fulfill({ json: {
      people: first ? [{ id: "one", display_name: "Elena Rivera" }] : [{ id: "two", display_name: "James Reed" }],
      next_offset: first ? 1 : null,
    } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const followers = page.getByRole("button", { name: "Followers", exact: true });
  await followers.click();
  await expect(page.getByRole("heading", { name: "Followers", exact: true })).toBeFocused();
  await expect(page.getByRole("list", { name: "People who follow you" })).toContainText("Elena Rivera");
  await page.getByRole("button", { name: "Load more people" }).click();
  await expect(page.getByRole("list", { name: "People who follow you" })).toContainText("James Reed");
  await page.getByRole("button", { name: "Back to profile" }).click();
  await expect(followers).toBeFocused();

  const following = page.getByRole("button", { name: "Following", exact: true });
  await following.click();
  await expect(page.getByRole("heading", { name: "Following", exact: true })).toBeFocused();
  const people = page.getByRole("list", { name: "People you follow" });
  await expect(people).toContainText("Alex Bennett");
  await expect(people.getByRole("listitem")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(following).toBeFocused();
});
