import { expect, test } from "@playwright/test";
import { nearbyCells } from "../src/lib/maps/nearby-places";
import type { MapBounds } from "../src/types/discovery";

// Actual Mercator bounds of a 430 x 740 map, rather than a zoom-independent SDK stub.
function phoneBounds(latitude: number, longitude: number, zoom: number): MapBounds {
  const scale = 256 * 2 ** zoom;
  const x = (longitude + 180) / 360 * scale;
  const sine = Math.sin(latitude * Math.PI / 180);
  const y = (.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale;
  const lat = (pixel: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * pixel / scale))) * 180 / Math.PI;
  return { west: (x - 215) / scale * 360 - 180, east: (x + 215) / scale * 360 - 180,
    north: lat(y - 370), south: lat(y + 370) };
}

for (const [city, latitude, longitude] of [
  ["London", 42.9849, -81.2453], ["Toronto", 43.6532, -79.3832],
  ["Montreal", 45.5019, -73.5674], ["New York", 40.7128, -74.006],
] as const) {
  test(`${city} discovers nearby places at both city and street zooms`, () => {
    for (const zoom of [10, 11, 12, 13, 14, 15, 17]) {
      const bounds = phoneBounds(latitude, longitude, zoom);
      const cells = nearbyCells([bounds], zoom);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThanOrEqual(9);
      expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
      for (const cell of cells) {
        expect(cell.radius).toBeGreaterThanOrEqual(50);
        expect(cell.radius).toBeLessThanOrEqual(5000);
      }
    }
  });
}

test("wide city samples are spread across the viewport and retain quantized request keys", () => {
  const bounds = phoneBounds(43.6532, -79.3832, 11);
  const cells = nearbyCells([bounds], 11);
  expect(cells).toHaveLength(9);
  expect(new Set(cells.map((cell) => cell.center.longitude)).size).toBe(3);
  expect(new Set(cells.map((cell) => cell.center.latitude)).size).toBe(3);
  expect(nearbyCells([bounds], 11)).toEqual(cells);
  for (const cell of cells) {
    expect(cell.center.longitude).toBeGreaterThan(bounds.west);
    expect(cell.center.longitude).toBeLessThan(bounds.east);
    expect(cell.center.latitude).toBeGreaterThan(bounds.south);
    expect(cell.center.latitude).toBeLessThan(bounds.north);
  }
});

test("world views remain bounded and date-line city samples cover both sides", () => {
  expect(nearbyCells([{ west: -180, east: 180, south: -85, north: 85 }], 3)).toEqual([]);
  expect(nearbyCells([{ west: -180, east: 180, south: -85, north: 85 }], 13)).toEqual([]);
  const cells = nearbyCells([{ west: 179.5, east: 180, south: -1, north: 1 }, { west: -180, east: -179.5, south: -1, north: 1 }], 10);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.length).toBeLessThanOrEqual(9);
  expect(cells.some((cell) => cell.center.longitude > 179)).toBe(true);
  expect(cells.some((cell) => cell.center.longitude < -179)).toBe(true);
});
