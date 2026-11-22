import { expect, test } from "@playwright/test";
import { StableClusters } from "../src/lib/maps/stable-clusters";

class LatLng {
  constructor(private latitude: number | { lat: number; lng: number }, private longitude?: number) {}
  lat() { return typeof this.latitude === "number" ? this.latitude : this.latitude.lat; }
  lng() { return typeof this.latitude === "number" ? this.longitude! : this.latitude.lng; }
}
class Bounds {
  points: LatLng[] = [];
  constructor(a?: LatLng, b?: LatLng) { if (a) this.extend(a); if (b) this.extend(b); }
  extend(p: LatLng) { this.points.push(p); return this; }
}
class MapSDK {
  zoom = 13;
  center = { lat: 43, lng: -81 };
  fitted?: Bounds;
  getZoom() { return this.zoom; }
  getProjection() { return {}; }
  fitBounds(bounds: Bounds) { this.fitted = bounds; }
}
class MarkerSDK {
  writes: (MapSDK | null)[] = [];
  private current: MapSDK | null = null;
  private listeners = new Map<string, () => void>();
  constructor(public position: { lat: number; lng: number }, public count = 1,
    private timeline: MarkerSDK[] = []) {}
  get map() { return this.current; }
  set map(value: MapSDK | null) { this.current = value; this.writes.push(value); this.timeline.push(this); }
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
  removeEventListener(name: string, callback: () => void) { if (this.listeners.get(name) === callback) this.listeners.delete(name); }
  click() { this.listeners.get("gmp-click")?.(); }
}
let previous: PropertyDescriptor | undefined;
test.beforeAll(() => {
  previous = Object.getOwnPropertyDescriptor(globalThis, "google");
  Object.defineProperty(globalThis, "google", { configurable: true, value: { maps: {
    LatLng, LatLngBounds: Bounds, marker: { AdvancedMarkerElement: MarkerSDK },
  } } });
});
test.afterAll(() => {
  if (previous) Object.defineProperty(globalThis, "google", previous);
  else Reflect.deleteProperty(globalThis, "google");
});
const sdk = (marker: MarkerSDK) => marker as unknown as google.maps.marker.AdvancedMarkerElement;
function setup() {
  const map = new MapSDK(), groups: MarkerSDK[] = [], timeline: MarkerSDK[] = [];
  const renderer = new StableClusters(map as unknown as google.maps.Map, (cluster) => {
    const group = new MarkerSDK({ lat: cluster.position.lat(), lng: cluster.position.lng() }, cluster.count, timeline);
    groups.push(group); return sdk(group);
  });
  const dense = Array.from({ length: 20 }, (_, i) => new MarkerSDK({ lat: 42.985 + i * .00001, lng: -81.245 }, 1, timeline));
  const far = [new MarkerSDK({ lat: 44, lng: -80 }, 1, timeline), new MarkerSDK({ lat: 44.00001, lng: -80 }, 1, timeline)];
  const single = new MarkerSDK({ lat: 46, lng: -78 }, 1, timeline);
  [...dense, ...far, single].forEach((marker) => renderer.addMarker(sdk(marker)));
  renderer.render();
  return { map, renderer, groups, timeline, dense, far, single };
}

test("cached pans perform zero SDK attachment writes for both groups and individual places", () => {
  const app = setup();
  expect(app.groups.map((group) => group.count).sort((a, b) => a - b)).toEqual([2, 20]);
  const before = app.timeline.length;
  for (let i = 0; i < 4; i++) {
    app.map.center.lng += .001; app.renderer.render();
  }
  expect(app.timeline).toHaveLength(before);
  expect(app.groups).toHaveLength(2);
  app.dense.forEach((marker) => expect(marker.writes).toEqual([]));
  expect(app.single.writes).toEqual([app.map]);
  app.renderer.destroy();
});

test("a new nearby batch changes only its affected group and never repaints unrelated points", () => {
  const app = setup();
  const old = app.groups.find((group) => group.count === 20)!;
  const untouched = app.groups.find((group) => group.count === 2)!;
  const before = app.timeline.length;
  app.renderer.addMarker(sdk(new MarkerSDK({ lat: 42.985, lng: -81.245 })));
  app.renderer.render();
  const replacement = app.groups.find((group) => group.count === 21)!;
  expect(replacement.map).toBe(app.map);
  expect(old.map).toBe(null);
  expect(untouched.writes).toEqual([app.map]);
  expect(app.single.writes).toEqual([app.map]);
  app.dense.forEach((marker) => expect(marker.writes).toEqual([]));
  expect(app.timeline.slice(before)).toEqual([replacement, old]);
  app.renderer.destroy();
});

test("selection transfers attachment ownership without a detach/reattach flash", () => {
  const app = setup(), selected = app.dense[0];
  app.renderer.removeMarker(sdk(selected), true);
  selected.map = app.map;
  app.renderer.render();
  expect(selected.writes).toEqual([app.map]);
  expect(app.groups.find((group) => group.count === 19)?.map).toBe(app.map);
  app.renderer.addMarker(sdk(selected)); app.renderer.render();
  expect(selected.writes).toEqual([app.map, null]);
  expect(app.groups.filter((group) => group.map === app.map).reduce((sum, group) => sum + group.count, 0)).toBe(22);
  expect(app.single.writes).toEqual([app.map]);
  app.renderer.destroy();
});

test("zoom expansion and regrouping retain instances, counted membership and working cluster clicks", () => {
  const app = setup();
  app.groups.find((group) => group.count === 20)!.click();
  expect(app.map.fitted?.points.length).toBeGreaterThanOrEqual(20);
  app.map.zoom = 18; app.renderer.render();
  [...app.dense, ...app.far, app.single].forEach((marker) => expect(marker.map).toBe(app.map));
  expect(app.groups.every((group) => group.map === null)).toBe(true);
  const before = app.timeline.length;
  app.map.center.lng += .001; app.renderer.render();
  expect(app.timeline).toHaveLength(before);
  app.map.zoom = 13; app.renderer.render();
  expect(app.groups.filter((group) => group.map === app.map).reduce((sum, group) => sum + group.count, 0)).toBe(22);
  expect(app.single.writes).toEqual([app.map]);
  app.renderer.destroy();
  expect([...app.dense, ...app.far, app.single, ...app.groups].every((marker) => marker.map === null)).toBe(true);
  const removed = app.timeline.length; app.renderer.destroy(); expect(app.timeline).toHaveLength(removed);
});
