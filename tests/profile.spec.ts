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
      display_name: "Alex", total: 2, favorites: [entry],
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
