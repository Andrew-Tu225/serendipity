import { expect, test } from "@playwright/test";
import { DiscoveryCache, DISCOVERY_FRESH_MS } from "../src/lib/maps/discovery-cache";
import { mapPlace } from "../src/types/discovery";
import { appPlaces } from "./helpers/discovery";

const area = { west: -82, east: -80, south: 42, north: 44 };
const first = mapPlace(appPlaces[0]);

test("cache preserves unchanged objects, updates changed ratings, and expires coverage", () => {
  const cache = new DiscoveryCache();
  cache.merge([first], 0);
  cache.complete(area, new Set([first.place_id]), 0, 0);
  cache.merge([structuredClone(first)], 1);
  expect(cache.get(first.place_id)).toBe(first);
  expect(cache.missing([area], DISCOVERY_FRESH_MS - 1)).toEqual([]);
  expect(cache.missing([area], DISCOVERY_FRESH_MS)).toEqual([area]);
  const changed = { ...first, rating_summary: { average: 2, count: 25 } };
  cache.merge([changed], 2);
  expect(cache.get(first.place_id)).toBe(changed);
});

test("partial pages do not establish coverage or remove earlier pins", () => {
  const cache = new DiscoveryCache();
  cache.merge([first, mapPlace(appPlaces[1])], 0);
  expect(cache.missing([area], 0)).toEqual([area]);
  expect(cache.read([area], 0)).toHaveLength(2);
  const start = cache.version;
  cache.complete(area, new Set([first.place_id]), start, 1);
  expect(cache.get(appPlaces[1].id)).toBeUndefined();
  expect(cache.get(first.place_id)).toBe(first);
});

test("empty coverage is cached, while a saved review invalidates its area", () => {
  const cache = new DiscoveryCache();
  cache.complete(area, new Set(), 0, 0);
  expect(cache.missing([area], 1)).toEqual([]);
  cache.merge([first], 2);
  cache.invalidateAt(first.location);
  expect(cache.missing([area], 2)).toEqual([area]);
  cache.complete(area, new Set(), 0, 3);
  expect(cache.get(first.place_id)).toBe(first); // A response begun before the save cannot erase it.
});

test("viewer changes remove personalized fields and coverage while retaining public data", () => {
  const cache = new DiscoveryCache();
  cache.merge([first], 0);
  cache.complete(area, new Set([first.place_id]), 0, 0);
  cache.clearPersonalization();
  expect(cache.get(first.place_id)?.friend).toBeUndefined();
  expect(cache.get(first.place_id)?.rating_summary).toEqual(first.rating_summary);
  expect(cache.missing([area], 1)).toEqual([area]);
});

test("old offscreen coverage is evicted and no longer promises cached places", () => {
  const cache = new DiscoveryCache();
  for (let index = 0; index < 40; index++) {
    const bounds = { west: -100 + index, east: -99 + index, south: 20, north: 21 };
    const place = { ...first, place_id: String(index), location: { latitude: 20.5, longitude: bounds.west + .5 } };
    cache.merge([place], index);
    cache.complete(bounds, new Set([place.place_id]), 0, index);
  }
  const active = [{ west: -61, east: -60, south: 20, north: 21 }];
  cache.prune(active);
  expect(cache.get("0")).toBeUndefined();
  expect(cache.get("39")).toBeDefined();
  expect(cache.missing([{ west: -100, east: -99, south: 20, north: 21 }], 40)).not.toEqual([]);
  expect(cache.missing(active, 40)).toEqual([]);
});

test("place budget evicts offscreen data but never truncates active results", () => {
  const cache = new DiscoveryCache();
  const places = Array.from({ length: 5002 }, (_, index) => ({ ...first, place_id: String(index) }));
  cache.merge(places, 0);
  cache.complete(area, new Set(places.map((place) => place.place_id)), 0, 0);
  cache.prune([area]);
  expect(cache.read([area], 1)).toHaveLength(5002);
  cache.prune([{ west: 0, east: 1, south: 0, north: 1 }]);
  expect(cache.read([area], 2)).toHaveLength(5000);
  expect(cache.missing([area], 2)).not.toEqual([]);
});
