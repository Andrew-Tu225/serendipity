import { expect, test } from "@playwright/test";
import { nearbyCells } from "../src/lib/maps/nearby-places";

import { phoneBounds } from "./helpers/map-bounds";

for (const [city, latitude, longitude] of [
  ["London", 42.9849, -81.2453], ["Toronto", 43.6532, -79.3832],
  ["Montreal", 45.5019, -73.5674], ["New York", 40.7128, -74.006],
] as const) {
  test(`${city} schedules stable geographic searches at city and street zooms`, () => {
    for (const zoom of [10, 11, 12, 13, 14, 15, 17]) {
      const bounds = phoneBounds(latitude, longitude, zoom);
      const cells = nearbyCells([bounds], zoom);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThanOrEqual(512);
      expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
      for (const cell of cells) {
        expect(cell.radius).toBeGreaterThanOrEqual(50);
        expect(cell.radius).toBeLessThanOrEqual(5000);
      }
    }
  });
}

test("city coverage includes every intersecting root cell instead of nine samples", () => {
  const bounds = phoneBounds(43.6532, -79.3832, 11);
  const cells = nearbyCells([bounds], 11);
  expect(cells.length).toBeGreaterThan(9);
  const xs = [...new Set(cells.map((cell) => cell.x))].sort((a, b) => a - b);
  const ys = [...new Set(cells.map((cell) => cell.y))].sort((a, b) => a - b);
  expect(cells).toHaveLength(xs.length * ys.length);
  xs.slice(1).forEach((x, i) => expect(x).toBe(xs[i] + 1));
  ys.slice(1).forEach((y, i) => expect(y).toBe(ys[i] + 1));
  expect(nearbyCells([bounds], 11)).toEqual(cells);
  for (const cell of cells) {
    expect(cell.bounds.east).toBeGreaterThan(bounds.west);
    expect(cell.bounds.west).toBeLessThan(bounds.east);
    expect(cell.bounds.north).toBeGreaterThan(bounds.south);
    expect(cell.bounds.south).toBeLessThan(bounds.north);
  }
});

test("world views remain bounded and date-line coverage searches both sides", () => {
  expect(nearbyCells([{ west: -180, east: 180, south: -85, north: 85 }], 3)).toEqual([]);
  expect(nearbyCells([{ west: -180, east: 180, south: -85, north: 85 }], 13)).toEqual([]);
  const cells = nearbyCells([{ west: 179.95, east: 180, south: -.05, north: .05 }, { west: -180, east: -179.95, south: -.05, north: .05 }], 13);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.length).toBeLessThanOrEqual(512);
  expect(cells.some((cell) => cell.center.longitude > 179)).toBe(true);
  expect(cells.some((cell) => cell.center.longitude < -179)).toBe(true);
});
