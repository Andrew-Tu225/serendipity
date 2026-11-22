import { expect, test } from "@playwright/test";
import { mapBrowseStatus } from "../src/lib/maps/browse-status";

const ready = { complete: true, error: "" };
const nearby = { ...ready, waiting: false, zoomIn: false };

test("base places can be browsed immediately while other work remains pending", () => {
  expect(mapBrowseStatus({ ...ready, complete: false }, { ...nearby, complete: false }, 1)).toBe("ready");
  expect(mapBrowseStatus(ready, nearby, 1)).toBe("ready");
});

test("empty means both base searches finished successfully with zero visible places", () => {
  expect(mapBrowseStatus(ready, { ...nearby, complete: false }, 0)).toBe("loading");
  expect(mapBrowseStatus({ ...ready, complete: false }, nearby, 0)).toBe("loading");
  expect(mapBrowseStatus(ready, nearby, 0)).toBe("empty");
});

test("budget waits, world views and errors never claim an empty area", () => {
  expect(mapBrowseStatus(ready, { ...nearby, waiting: true, complete: false }, 0)).toBe("waiting");
  expect(mapBrowseStatus(ready, { ...nearby, zoomIn: true, complete: false }, 0)).toBe("zoom-in");
  expect(mapBrowseStatus(ready, { ...nearby, error: "Provider failed", complete: false }, 0)).toBe("ready");
});
