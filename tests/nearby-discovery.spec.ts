import { expect, test } from "@playwright/test";
import { NearbyDiscovery, type NearbyClock, type NearbyView } from "../src/lib/maps/nearby-discovery";
import { nearbyCell, type NearbyCell } from "../src/lib/maps/nearby-places";
import type { MapPlace } from "../src/types/places";
import { phoneBounds } from "./helpers/map-bounds";

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
class Clock implements NearbyClock {
  value = 0;
  serial = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.value;
  set = (callback: () => void, delay: number) => {
    const id = ++this.serial; this.timers.set(id, { at: this.value + delay, callback }); return id;
  };
  clear = (id: unknown) => { this.timers.delete(id as number); };
  async advance(delay: number) {
    const target = this.value + delay;
    for (;;) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      this.value = next[1].at; this.timers.delete(next[0]); next[1].callback(); await flush();
    }
    this.value = target; await flush();
  }
}
function viewport(width = 1, height = 1, x = 2289, y = 2990, zoom = 14) {
  const first = nearbyCell(13, x, y), last = nearbyCell(13, x + width - 1, y + height - 1);
  const bounds = [{ west: first.bounds.west + 1e-8, east: last.bounds.east - 1e-8,
    south: last.bounds.south + 1e-8, north: first.bounds.north - 1e-8 }];
  return { bounds, center: { latitude: (bounds[0].south + bounds[0].north) / 2,
    longitude: (bounds[0].west + bounds[0].east) / 2 }, zoom };
}
function place(cell: NearbyCell, id = cell.key): MapPlace {
  return { source: "google", place_id: id, display_name: id, location: cell.center,
    address: "", attributions: [], google_maps_uri: "https://maps.google.com/" };
}
function setup(fetch: (cell: NearbyCell, signal: AbortSignal) => Promise<MapPlace[]>) {
  const time = new Clock();
  let view!: NearbyView;
  const loader = new NearbyDiscovery(fetch, (next) => { view = next; }, time);
  return { time, loader, view: () => view };
}

test("all twelve visible areas are searched progressively, rather than only nine sampled areas", async () => {
  const calls: string[] = [];
  const app = setup(async (cell) => { calls.push(cell.key); return [place(cell)]; });
  app.loader.update(viewport(4, 3));
  expect(app.view().loading).toBe(true);
  await app.time.advance(500);
  expect(calls).toHaveLength(12);
  expect(new Set(calls).size).toBe(12);
  expect(app.view().places).toHaveLength(12);
  expect(app.view().complete).toBe(true);
  app.loader.pause();
});

test("sparse area searches are reused across zooms, small pans, and a pause/resume", async () => {
  const calls: string[] = [];
  const app = setup(async (cell) => { calls.push(cell.key); return [place(cell)]; });
  const initial = viewport(2, 3);
  app.loader.update(initial); await app.time.advance(500);
  const identities = app.view().places;
  for (const zoom of [15, 16, 17]) {
    app.loader.update({ ...initial, zoom }); await app.time.advance(500);
    expect(app.view().places).toBe(identities);
  }
  app.loader.pause(); app.loader.update(initial); await app.time.advance(500);
  expect(calls).toHaveLength(6);
  expect(app.view().places).toBe(identities);
  app.loader.pause();
});

test("the real Toronto phone zoom sequence needs six sparse searches instead of twenty-two", async () => {
  const calls: string[] = [];
  const app = setup(async (cell) => { calls.push(cell.key); return [place(cell)]; });
  const center = { latitude: 43.6532, longitude: -79.3832 };
  for (const zoom of [14, 15, 16, 17]) {
    app.loader.update({ bounds: [phoneBounds(center.latitude, center.longitude, zoom)], center, zoom });
    await app.time.advance(500);
  }
  expect(calls).toHaveLength(6);
  expect(new Set(calls).size).toBe(6);
  expect(app.view().waiting).toBe(false);
  expect(app.view().complete).toBe(true);
  app.loader.pause();
});

test("only capped responses refine; parent results stay available while children load", async () => {
  const calls: NearbyCell[] = [], release: (() => void)[] = [];
  const app = setup(async (cell) => {
    calls.push(cell);
    if (cell.level === 13) return Array.from({ length: 20 }, (_, i) => place(cell, `parent-${i}`));
    await new Promise<void>((resolve) => release.push(resolve));
    return [place(cell)];
  });
  app.loader.update(viewport()); await app.time.advance(500);
  expect(app.view().places).toHaveLength(20);
  expect(app.view().loading).toBe(true);
  expect(calls.filter((cell) => cell.level === 14)).toHaveLength(3);
  release[0](); await flush();
  expect(calls.filter((cell) => cell.level === 14)).toHaveLength(4);
  release.forEach((resolve) => resolve()); await flush();
  expect(app.view().places).toHaveLength(24);
  expect(app.view().complete).toBe(true);
  app.loader.update(viewport(1, 1, 2289, 2990, 18)); await app.time.advance(500);
  expect(calls).toHaveLength(5);
  app.loader.pause();
});

test("the rolling budget pauses and resumes unfinished coverage without losing places", async () => {
  let calls = 0;
  const app = setup(async (cell) => { calls++; return [place(cell)]; });
  app.loader.update(viewport(5, 5)); await app.time.advance(500);
  expect(calls).toBe(18);
  expect(app.view().places).toHaveLength(18);
  expect(app.view().waiting).toBe(true);
  expect(app.view().complete).toBe(false);
  await app.time.advance(60_001);
  expect(calls).toBe(25);
  expect(app.view().places).toHaveLength(25);
  expect(app.view().waiting).toBe(false);
  expect(app.view().complete).toBe(true);
  app.loader.pause();
});

test("initial coverage across the viewport takes priority over dense-area refinement", async () => {
  const calls: NearbyCell[] = [];
  const app = setup(async (cell) => {
    calls.push(cell);
    return Array.from({ length: cell.level === 13 ? 20 : 1 }, (_, i) => place(cell, `${cell.key}-${i}`));
  });
  app.loader.update(viewport(4, 3, 2289, 2990, 13)); await app.time.advance(500);
  expect(calls).toHaveLength(18);
  expect(calls.slice(0, 12).every((cell) => cell.level === 13)).toBe(true);
  expect(calls.filter((cell) => cell.level === 14)).toHaveLength(6);
  expect(app.view().places.length).toBeGreaterThanOrEqual(240);
  expect(app.view().waiting).toBe(true);
  app.loader.pause();
});

test("one failed cell does not stop other areas and retries preserve unchanged place objects", async () => {
  let failing = true;
  const calls: string[] = [];
  const app = setup(async (cell) => {
    calls.push(cell.key);
    if (cell.x === 2289 && failing) throw new Error("Provider unavailable");
    return [place(cell)];
  });
  app.loader.update(viewport(3)); await app.time.advance(500);
  expect(calls).toHaveLength(3);
  expect(app.view().places).toHaveLength(2);
  expect(app.view().error).toContain("Provider unavailable");
  const first = app.view().places[0];
  failing = false; app.loader.retry(); await app.time.advance(500);
  expect(calls).toHaveLength(4);
  expect(app.view().complete).toBe(true);
  expect(app.view().error).toBe("");
  expect(app.view().places.find((p) => p.place_id === first.place_id)).toBe(first);
  app.loader.pause();
});

test("obsolete and paused requests cannot publish late results or claim cached coverage", async () => {
  const requests: { cell: NearbyCell; signal: AbortSignal; resolve: (places: MapPlace[]) => void }[] = [];
  const app = setup((cell, signal) => new Promise((resolve) => { requests.push({ cell, signal, resolve }); }));
  app.loader.update(viewport()); await app.time.advance(500);
  app.loader.update(viewport(1, 1, 3000));
  expect(requests[0].signal.aborted).toBe(true);
  await app.time.advance(500);
  requests[1].resolve([place(requests[1].cell, "new area")]); await flush();
  requests[0].resolve([place(requests[0].cell, "obsolete")]); await flush();
  expect(app.view().places.map((p) => p.place_id)).toEqual(["new area"]);
  app.loader.update(viewport()); await app.time.advance(500);
  expect(requests).toHaveLength(3);
  app.loader.pause();
  requests[2].resolve([place(requests[2].cell, "paused")]); await flush();
  app.loader.update(viewport()); await app.time.advance(500);
  expect(requests).toHaveLength(4);
  expect(app.view().places.some((p) => p.place_id === "obsolete" || p.place_id === "paused")).toBe(false);
  app.loader.pause();
});

test("latest completed duplicate wins and unchanged refreshes reuse place identity", async () => {
  let revision = 0;
  const app = setup(async (cell) => [{ ...place(cell, "same-google-id"), location: nearbyCell(13, 2289, 2990).center,
    display_name: `version-${revision}` }]);
  app.loader.update(viewport(2)); await app.time.advance(500);
  expect(app.view().places).toHaveLength(1);
  const first = app.view().places[0];
  await app.time.advance(300_001);
  expect(app.view().places[0]).toBe(first);
  revision = 1; await app.time.advance(300_001);
  expect(app.view().places[0].display_name).toBe("version-1");
  expect(app.view().places).toHaveLength(1);
  app.loader.pause();
});

test("a pending batch never exceeds three concurrent requests", async () => {
  let running = 0, peak = 0;
  const release: (() => void)[] = [];
  const app = setup(async () => {
    running++; peak = Math.max(peak, running);
    await new Promise<void>((resolve) => release.push(resolve));
    running--; return [];
  });
  app.loader.update(viewport(4, 3)); await app.time.advance(500);
  expect(release).toHaveLength(3);
  for (let batch = 0; batch < 20 && !app.view().complete; batch++) {
    release.splice(0).forEach((resolve) => resolve()); await flush();
  }
  expect(app.view().complete).toBe(true);
  expect(peak).toBe(3);
  app.loader.pause();
});
