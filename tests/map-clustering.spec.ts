import { expect, test } from "@playwright/test";
import { SuperClusterAlgorithm } from "@googlemaps/markerclusterer";

// Exercise the installed production clustering algorithm without launching a browser.
class LatLng {
  private latitude: number;
  private longitude: number;
  constructor(point: number | { lat: number; lng: number }, longitude?: number) {
    this.latitude = typeof point === "number" ? point : point.lat;
    this.longitude = typeof point === "number" ? longitude! : point.lng;
  }
  lat() { return this.latitude; }
  lng() { return this.longitude; }
}
class Marker {
  layer = "place";
  constructor(public position: { lat: number; lng: number }) {}
}
let previous: PropertyDescriptor | undefined;
test.beforeAll(() => {
  previous = Object.getOwnPropertyDescriptor(globalThis, "google");
  Object.defineProperty(globalThis, "google", { configurable: true, value: { maps: { LatLng, marker: { AdvancedMarkerElement: Marker } } } });
});
test.afterAll(() => {
  if (previous) Object.defineProperty(globalThis, "google", previous);
  else Reflect.deleteProperty(globalThis, "google");
});

const dense = () => Array.from({ length: 20 }, (_, i) => new Marker({ lat: 42.985 + Math.floor(i / 5) * .00005, lng: -81.245 + i % 5 * .00005 }));
function input(markers: Marker[], zoom = 13) {
  return { markers: markers as unknown as google.maps.marker.AdvancedMarkerElement[],
    map: { getZoom: () => zoom } as google.maps.Map, mapCanvasProjection: {} as google.maps.MapCanvasProjection };
}

test("all twenty nearby places contribute to a counted cluster instead of being discarded", () => {
  const markers = dense();
  const result = new SuperClusterAlgorithm({}).calculate(input(markers));
  expect(result.clusters).toHaveLength(1);
  expect(result.clusters[0].count).toBe(20);
  expect(new Set(result.clusters.flatMap((cluster) => cluster.markers))).toEqual(new Set(markers));
});

test("expanding clusters preserves every original marker instance", () => {
  const markers = dense(), algorithm = new SuperClusterAlgorithm({});
  algorithm.calculate(input(markers));
  const expanded = algorithm.calculate(input(markers, 18));
  expect(expanded.clusters).toHaveLength(20);
  expect(expanded.clusters.every((cluster) => cluster.count === 1)).toBe(true);
  expect(new Set(expanded.clusters.flatMap((cluster) => cluster.markers))).toEqual(new Set(markers));
});

test("colour updates do not rebuild membership; incoming places update counts without dropping existing ones", () => {
  const markers = dense(), algorithm = new SuperClusterAlgorithm({});
  const initial = algorithm.calculate(input(markers));
  markers[0].layer = "friend";
  const recoloured = algorithm.calculate(input(markers));
  expect(recoloured.changed).toBe(false);
  expect(recoloured.clusters).toBe(initial.clusters);
  const combined = [...markers, new Marker({ lat: 42.985, lng: -81.245 })];
  const updated = algorithm.calculate(input(combined));
  expect(updated.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(21);
  expect(new Set(updated.clusters.flatMap((cluster) => cluster.markers))).toEqual(new Set(combined));
});
