import { expect, test } from "@playwright/test";

const session = {
  auth0: { sub: "auth0|browser-test", name: "Alex", email: "alex@example.com" },
  user: {
    id: "be1d7315-252d-4479-b475-fdcf09b1a304",
    auth0_sub: "auth0|browser-test",
    email: "alex@example.com",
    email_verified: false,
    display_name: "Alex from Postgres",
    picture_url: null,
    created_at: "2026-11-21T12:00:00Z",
    updated_at: "2026-11-21T12:00:00Z",
  },
  csrf_token: "private-csrf-token-for-test",
};

test("login starts full browser navigation through the API client", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({
    contentType: "text/html", body: "<h1>Auth0 hosted login</h1>",
  }));
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in / Sign up" }).click();
  await expect(page).toHaveURL(/\/api\/auth\/login$/);
  await expect(page.getByRole("heading", { name: "Auth0 hosted login" })).toBeVisible();
});

test("success displays the payload and stored user, and sign out sends CSRF", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: session }));
  let signedOut = false;
  await page.route("**/api/auth/logout", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe(session.csrf_token);
    signedOut = true;
    const origin = new URL(page.url()).origin;
    await route.fulfill({ json: { logout_url: `${origin}/login?signed_out=1` } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/success");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Successful");
  await expect(page.locator("pre").nth(0)).toHaveText(JSON.stringify(session.auth0, null, 2));
  await expect(page.locator("pre").nth(1)).toHaveText(JSON.stringify(session.user, null, 2));
  await expect(page.locator("body")).not.toContainText(session.csrf_token);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(1);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflows).toBe(false);
  await page.screenshot({ path: "test-results/success-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1$/);
  expect(signedOut).toBe(true);
});

test("signed-out visitors return to login", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 401, json: { detail: "Sign in to continue" },
  }));
  await page.goto("/success");
  await expect(page).toHaveURL(/\/login$/);
});

test("service failures can be retried without showing a false success", async ({ page }) => {
  let available = false;
  await page.route("**/api/auth/me", (route) => {
    return !available
      ? route.fulfill({ status: 503, json: { detail: "Database is unavailable" } })
      : route.fulfill({ json: session });
  });
  await page.goto("/success");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Database is unavailable");
  await expect(page.getByRole("heading", { name: "Successful" })).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Successful" })).toBeVisible();
});
