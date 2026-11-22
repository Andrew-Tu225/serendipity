import { expect, test } from "@playwright/test";
import { bufferBounds } from "../src/lib/maps/bounds";
import { coversViewport, RecommendationCache, RECOMMENDATION_FRESH_MS } from "../src/lib/maps/recommendation-cache";
import { recommendationPlace } from "../src/lib/maps/recommendations";
import { appPlaces, recommendation } from "./helpers/discovery";

const view = [{ west: 0, east: 4, south: 0, north: 4 }];
const places = [recommendationPlace(recommendation(appPlaces[0]))];

test("small pans reuse a complete ranking and expiry refreshes the same area", () => {
  const cache = new RecommendationCache();
  const area = cache.areaFor(view);
  expect(area).toEqual(bufferBounds(view));
  cache.remember(area, places, 0);
  const pan = [{ ...view[0], west: .5, east: 4.5 }];
  expect(cache.fresh(pan, 1)?.places).toBe(places);
  expect(cache.fresh(pan, RECOMMENDATION_FRESH_MS - 1)?.places).toBe(places);
  expect(cache.fresh(pan, RECOMMENDATION_FRESH_MS)).toBeUndefined();
  expect(cache.areaFor(pan)).toBe(area);
  const outside = [{ ...view[0], west: 1.1, east: 5.1 }];
  expect(cache.fresh(outside, 1)).toBeUndefined();
  expect(cache.areaFor(outside)).toEqual(bufferBounds(outside));
});

test("returning to a cached area keeps its ranking stable through overlapping coverage", () => {
  const cache = new RecommendationCache();
  cache.remember(cache.areaFor(view), places, 0);
  const otherView = [{ ...view[0], west: 1.5, east: 5.5 }];
  const other = [recommendationPlace(recommendation(appPlaces[1]))];
  cache.remember(cache.areaFor(otherView), other, 1);
  expect(cache.fresh(view, 2)?.places).toBe(places);
  // Both snapshots cover this view; the active older one must keep winning.
  expect(cache.fresh([{ ...view[0], west: .75, east: 4.75 }], 3)?.places).toBe(places);
});

test("empty rankings cache normally and invalidation drops all personalized areas", () => {
  const cache = new RecommendationCache();
  cache.remember(cache.areaFor(view), [], 0);
  expect(cache.fresh(view, 1)?.places).toEqual([]);
  cache.clear();
  expect(cache.fresh(view, 1)).toBeUndefined();
  expect(cache.areaFor(view)).toEqual(bufferBounds(view));
});

test("ranking snapshots are bounded without treating adjacent areas as exhaustive coverage", () => {
  const cache = new RecommendationCache();
  for (let i = 0; i < 9; i++) cache.remember([{ ...view[0], west: i * 10, east: i * 10 + 4 }], places, i);
  expect(cache.fresh(view, 10)).toBeUndefined();
  expect(cache.fresh([{ ...view[0], west: 80, east: 84 }], 10)?.places).toBe(places);
  cache.remember([{ west: 0, east: 2, south: 0, north: 4 }], places, 11);
  cache.remember([{ west: 2, east: 4, south: 0, north: 4 }], places, 12);
  expect(cache.fresh(view, 13)).toBeUndefined();
});

test("buffered date-line coverage can retain an applicable in-flight request", () => {
  const visible = [{ west: 179, east: 180, south: 0, north: 4 }, { west: -180, east: -179, south: 0, north: 4 }];
  const area = bufferBounds(visible);
  expect(coversViewport(area, visible)).toBe(true);
  expect(coversViewport(area, [{ ...visible[0], west: 179.25 }, { ...visible[1], east: -178.75 }])).toBe(true);
  expect(coversViewport(area, [{ ...visible[0], west: 178 }])).toBe(false);
});
