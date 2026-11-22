import { expect, test } from "@playwright/test";
import { bufferBounds, intersects, subtractBounds, uncoveredBounds } from "../src/lib/maps/bounds";
import { type MapBounds } from "../src/types/discovery";

const size = (bounds: MapBounds) => (bounds.east - bounds.west) * (bounds.north - bounds.south);

test("subtracting coverage produces disjoint rectangles with the correct remaining area", () => {
  const outer = { west: 0, east: 10, south: 0, north: 10 };
  const center = { west: 3, east: 7, south: 3, north: 7 };
  const result = subtractBounds(outer, center);
  expect(result.reduce((total, rectangle) => total + size(rectangle), 0)).toBe(84);
  for (let a = 0; a < result.length; a++) {
    expect(intersects(result[a], center)).toBe(false);
    for (let b = a + 1; b < result.length; b++) expect(intersects(result[a], result[b])).toBe(false);
  }
  expect(uncoveredBounds([outer], [center, ...result])).toEqual([]);
  expect(subtractBounds(outer, { ...outer, west: 10, east: 12 })).toEqual([outer]);
});

test("buffering handles ordinary, date-line, pole, and worldwide views", () => {
  expect(bufferBounds([{ west: 0, east: 4, south: 0, north: 4 }])).toEqual([{ west: -1, east: 5, south: -1, north: 5 }]);
  expect(bufferBounds([{ west: 170, east: 180, south: -10, north: 10 }, { west: -180, east: -170, south: -10, north: 10 }])).toEqual([
    { west: 165, east: 180, south: -15, north: 15 }, { west: -180, east: -165, south: -15, north: 15 },
  ]);
  expect(bufferBounds([{ west: -180, east: 180, south: -85, north: 85 }])).toEqual([{ west: -180, east: 180, south: -90, north: 90 }]);
  expect(bufferBounds([{ west: -179, east: -175, south: 80, north: 90 }])).toEqual([{ west: -180, east: -174, south: 77.5, north: 90 }]);
});

