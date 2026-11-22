import { expect, test, type Page } from "@playwright/test";
import type { BuddyMessage } from "../src/types/buddies";
import { signedIn } from "./helpers/discovery";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    json: { ...signedIn, csrf_token: "buddy-csrf" },
  }));
});

async function swipe(page: Page, buddy: string, distance: number) {
  const card = page.getByRole("article", { name: `${buddy}, taste buddy` });
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(90, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + distance, y + 4, { steps: 8 });
  await page.mouse.up();
}

test("swipes through Buddy cards and continues a conversation from the Buddy-only inbox", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  const alex = { id: "alex", display_name: "Alex Bennett", character: null, match_percent: 94, liked_categories: ["bar", "restaurant"] };
  const elena = { id: "elena", display_name: "Elena Rivera", character: null, match_percent: 91, liked_categories: ["cafe", "gallery"] };
  const jordan = { id: "jordan", display_name: "Jordan Ellis", character: null, match_percent: 88, liked_categories: ["trail", "park"] };
  const nora = { id: "nora", display_name: "Nora Patel", character: null };
  const arrival = { id: "new-message", body: "Want to see the new gallery?", from_you: false, sent_at: "2026-11-22T12:00:00Z" };
  let sent: BuddyMessage | undefined;
  let unread = 1;
  await page.route("**/api/buddies/suggestions", (route) => route.fulfill({ json: [alex, elena, jordan] }));
  await page.route("**/api/buddies/skips/alex", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/buddies/chats/elena", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { messages: sent ? [sent] : [], next_before: null } });
    }
    const { id, body } = route.request().postDataJSON();
    sent = { id, body, from_you: true, sent_at: "2026-11-22T13:00:00Z" };
    return route.fulfill({ status: 201, json: sent });
  });
  await page.route("**/api/buddies/inbox?**", (route) => route.fulfill({
    json: {
      threads: [
        ...(sent ? [{ buddy: elena, latest: sent, unread_count: 0 }] : []),
        { buddy: nora, latest: arrival, unread_count: unread },
      ],
      next_offset: null,
      unread_count: unread,
    },
  }));
  await page.route("**/api/buddies/inbox/read**", (route) => {
    if (!new URL(route.request().url()).searchParams.has("buddy_id")) unread = 0;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/");
  const inbox = page.getByRole("button", { name: "Inbox", exact: true });
  await expect(inbox).toHaveCount(0);
  await page.getByRole("button", { name: "Buddy", exact: true }).click();
  await expect(inbox).toBeVisible();
  const alexCard = page.getByRole("article", { name: "Alex Bennett, taste buddy" });
  await expect(alexCard).toContainText("Enjoys bars and restaurants.");
  const photo = alexCard.locator(".buddy-photo");
  await expect(photo.locator(".character-portrait")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip", exact: true })).toBeInViewport();
  expect((await photo.boundingBox())!.height).toBeGreaterThan(300);
  await swipe(page, "Alex Bennett", -125);
  await expect(page.getByRole("article", { name: "Elena Rivera, taste buddy" })).toContainText(
    "Enjoys cafés and galleries.",
  );
  await swipe(page, "Elena Rivera", 125);
  const sheet = page.getByRole("dialog", { name: "Say hey to Elena" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Want to check it out?" }).click();
  await expect(sheet.getByRole("textbox", { name: "Message" })).toHaveValue("Want to check it out?");
  await sheet.getByRole("textbox", { name: "Message", exact: true }).fill("Want to get coffee after pottery?");
  await sheet.getByRole("button", { name: "Send message", exact: true }).click();
  const bubbles = page.getByRole("list", { name: "Messages" });
  await expect(bubbles.getByRole("listitem")).toHaveCount(1);
  await expect(bubbles).toContainText("Want to get coffee after pottery?");
  await page.getByRole("button", { name: "Back to inbox" }).click();
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(page.getByText("1 unread message", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Read all", exact: true }).click();
  await expect(page.getByText("0 unread messages", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close inbox" }).click();
  await expect(page.getByRole("article", { name: "Jordan Ellis, taste buddy" })).toBeVisible();
  await inbox.click();
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close inbox" }).locator("svg path")).toHaveAttribute("d", "m6 6 12 12M18 6 6 18");
  await page.getByRole("button", { name: /Elena Rivera.*Want to get coffee after pottery/ }).click();
  await expect(bubbles).toContainText("Want to get coffee after pottery?");
  await page.getByRole("button", { name: "Back to inbox" }).click();
  await page.getByRole("button", { name: "Close inbox" }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(inbox).toHaveCount(0);
});

test("uses authenticated message and skip endpoints only after the corresponding action", async ({ page }) => {
  const buddy = (id: string, display_name: string, liked_categories: string[]) => ({
    id, display_name, character: null, match_percent: 80, liked_categories,
  });
  await page.route("**/api/buddies/suggestions", (route) => route.fulfill({
    json: [buddy("one", "Alex", ["cafe", "gallery"]), buddy("two", "Elena", [])],
  }));
  await page.route("**/api/buddies/inbox/read?**", (route) => route.fulfill({ status: 204 }));
  let skips = 0;
  await page.route("**/api/buddies/skips/one", (route) => {
    expect(route.request().method()).toBe("PUT");
    expect(route.request().headers()["x-csrf-token"]).toBe("buddy-csrf");
    skips += 1;
    return route.fulfill({ status: 204 });
  });
  let sends = 0;
  let hasReply = false;
  await page.route("**/api/buddies/chats/two", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      messages: hasReply ? [{ id: "reply", body: "Hi, let’s go!", from_you: false, sent_at: "2026-11-22T13:01:00Z" }] : [],
      next_before: null,
    } });
    expect(route.request().headers()["x-csrf-token"]).toBe("buddy-csrf");
    sends += 1;
    const data = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ...data, from_you: true, sent_at: "2026-11-22T13:00:00Z" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Buddy", exact: true }).click();
  await expect(page.getByRole("article", { name: "Alex, taste buddy" })).toContainText("Enjoys cafés and galleries.");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Elena", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Elena, taste buddy" })).toContainText("Still finding their favorite places.");
  expect(skips).toBe(1);
  await page.getByRole("button", { name: "Message", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Say hey to Elena" })).toBeVisible();
  expect(sends).toBe(0);
  await page.getByRole("textbox", { name: "Message" }).fill("Hello!");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("list", { name: "Messages" })).toContainText("Hello!");
  expect(sends).toBe(1);
  hasReply = true;
  await expect(page.getByRole("list", { name: "Messages" })).toContainText("Hi, let’s go!", { timeout: 9000 });
});
