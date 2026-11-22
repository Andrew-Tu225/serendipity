import { expect, test } from "@playwright/test";
import { mergeMapLayers, markerLayer } from "../src/lib/maps/layers";
import { recommendationPlace } from "../src/lib/maps/recommendations";
import { mapPlace } from "../src/types/discovery";
import { appPlaces, recommendation } from "./helpers/discovery";
import type { MapPlace } from "../src/types/places";

test("recommendation metadata never filters base destinations and exact IDs avoid duplicates", () => {
  const nearby: MapPlace[] = Array.from({ length: 30 }, (_, i) => ({ source: "google", place_id: `google-${i}`,
    display_name: `Destination ${i}`, location: { latitude: 43, longitude: -79 }, address: "", attributions: [], google_maps_uri: "https://maps.google.com/" }));
  const reviewed = [mapPlace({ ...appPlaces[0], google_place_id: "google-0" }), mapPlace(appPlaces[1])];
  const before = mergeMapLayers(nearby, reviewed, []);
  expect(before.size).toBe(31);
  expect(before.has("google:google-0")).toBe(false);
  const highlighted = mergeMapLayers(nearby, reviewed, [recommendationPlace(recommendation(appPlaces[0]))]);
  expect([...highlighted.keys()]).toEqual([...before.keys()]);
  expect(highlighted.get(`app:${appPlaces[0].id}`)?.rating_summary).toEqual(reviewed[0].rating_summary);
  expect(markerLayer(highlighted.get(`app:${appPlaces[0].id}`)!)).toBe("friend");
  expect(markerLayer(before.get(`app:${appPlaces[0].id}`)!)).toBe("review");
  expect([...before.keys()].filter((key) => key.startsWith("google:"))).toHaveLength(29);
});

test("ranking exclusions remove highlights while keeping the same base place data", () => {
  const base = mapPlace(appPlaces[0]);
  const highlighted = mergeMapLayers([], [base], [recommendationPlace(recommendation(appPlaces[0]))]);
  const after = mergeMapLayers([], [base], []);
  expect([...after.keys()]).toEqual([...highlighted.keys()]);
  expect(after.get(`app:${base.place_id}`)).toBe(base);
  expect(markerLayer(after.get(`app:${base.place_id}`)!)).toBe("review");
});
