import type { Coordinates, MapPlace } from "@/types/places";
import type { MapBounds } from "@/types/discovery";
import { bufferBounds, containsPoint, intersects } from "./bounds";
import { nearbyCells, nearbyChildren, NearbyRequestBudget, prioritizeNearbyCells, type NearbyCell } from "./nearby-places";

const FRESH_MS = 5 * 60_000;
const MAX_CONCURRENT = 3;
interface Viewport { bounds: MapBounds[]; center: Coordinates; zoom: number }
interface Entry { cell: NearbyCell; places: MapPlace[]; fetched: number; version: number }
interface Job { cell: NearbyCell; controller: AbortController }
export interface NearbyView {
  places: MapPlace[]; loading: boolean; complete: boolean; waiting: boolean; zoomIn: boolean; error: string;
}
export interface NearbyClock {
  now(): number;
  set(callback: () => void, delay: number): unknown;
  clear(timer: unknown): void;
}
const clock: NearbyClock = { now: () => Date.now(), set: (fn, delay) => setTimeout(fn, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) };

/** One queue owns nearby fetching, cache, retries, and budget across camera/tab changes. */
export class NearbyDiscovery {
  private entries = new Map<string, Entry>();
  private jobs = new Map<string, Job>();
  private failures = new Map<string, { retryAt: number; message: string }>();
  private budget = new NearbyRequestBudget();
  private viewport: Viewport = { bounds: [], center: { latitude: 0, longitude: 0 }, zoom: 13 };
  private active = false;
  private version = 0;
  private debounce: unknown;
  private wake: unknown;
  private view: NearbyView = { places: [], loading: true, complete: false, waiting: false, zoomIn: false, error: "" };

  constructor(private fetchCell: (cell: NearbyCell, signal: AbortSignal) => Promise<MapPlace[]>,
    private notify: (view: NearbyView) => void, private time: NearbyClock = clock) {}

  update(viewport: Viewport) {
    this.active = true;
    this.viewport = viewport;
    this.time.clear(this.debounce);
    this.time.clear(this.wake);
    const area = bufferBounds(viewport.bounds);
    for (const [key, job] of this.jobs) if (!area.some((bounds) => intersects(bounds, job.cell.bounds))) {
      this.jobs.delete(key); job.controller.abort();
    }
    this.prune(area);
    this.publish();
    this.debounce = this.time.set(() => { this.debounce = undefined; this.pump(); }, 500);
  }

  pause() {
    this.active = false;
    this.time.clear(this.debounce); this.debounce = undefined;
    this.time.clear(this.wake); this.wake = undefined;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
  }

  retry() { this.failures.clear(); this.update(this.viewport); }

  private plan() {
    const roots = nearbyCells(this.viewport.bounds, this.viewport.zoom);
    const required: NearbyCell[] = [], pending: NearbyCell[] = [];
    const now = this.time.now();
    const visit = (cell: NearbyCell) => {
      const entry = this.entries.get(cell.key);
      required.push(cell);
      if (!entry || now - entry.fetched >= FRESH_MS) pending.push(cell);
      // A full provider response may be truncated. Refine it only when inspecting that area.
      if (entry && entry.places.length >= 20 && cell.level < 16 && this.viewport.zoom >= cell.level) {
        for (const child of nearbyChildren(cell)) {
          if (this.viewport.bounds.some((bounds) => intersects(bounds, child.bounds))) visit(child);
        }
      }
    };
    roots.forEach(visit);
    return { roots, required, pending };
  }

  private pump() {
    if (!this.active || this.debounce !== undefined) return;
    this.time.clear(this.wake); this.wake = undefined;
    this.prune(bufferBounds(this.viewport.bounds));
    const now = this.time.now(), plan = this.plan();
    const ready = prioritizeNearbyCells(plan.pending.filter((cell) => !this.jobs.has(cell.key)
      && (this.failures.get(cell.key)?.retryAt ?? 0) <= now), this.viewport.center);
    // Fill unseen areas before repeatedly refreshing old responses in a wide view.
    ready.sort((a, b) => Number(this.entries.has(a.key)) - Number(this.entries.has(b.key)) || a.level - b.level);
    for (const cell of ready) {
      if (this.jobs.size >= MAX_CONCURRENT || !this.budget.take(now)) break;
      const job = { cell, controller: new AbortController() };
      this.jobs.set(cell.key, job);
      Promise.resolve().then(() => {
        job.controller.signal.throwIfAborted();
        return this.fetchCell(cell, job.controller.signal);
      }).then((places) => {
        if (!this.active || job.controller.signal.aborted || this.jobs.get(cell.key) !== job) return;
        this.entries.set(cell.key, { cell, places, fetched: this.time.now(), version: ++this.version });
        this.failures.delete(cell.key);
      }, (error: unknown) => {
        if (!this.active || job.controller.signal.aborted || this.jobs.get(cell.key) !== job) return;
        this.failures.set(cell.key, { retryAt: this.time.now() + 60_000,
          message: error instanceof Error ? `Nearby places couldn’t load. ${error.message}` : "Nearby places couldn’t load." });
      }).finally(() => {
        if (this.jobs.get(cell.key) !== job) return;
        this.jobs.delete(cell.key);
        this.pump();
      });
    }
    this.publish();
    const next = this.plan();
    const wakeAt = next.required.flatMap((cell) => {
      const expiry = (this.entries.get(cell.key)?.fetched ?? -Infinity) + FRESH_MS;
      const retryAt = this.failures.get(cell.key)?.retryAt ?? 0;
      return [expiry, retryAt].filter((at) => at > now);
    });
    const budgetAt = this.budget.retryAt(now);
    if (next.pending.length && budgetAt > now) wakeAt.push(budgetAt);
    if (wakeAt.length) this.wake = this.time.set(() => { this.wake = undefined; this.pump(); }, Math.max(1, Math.min(...wakeAt) - now));
  }

  private publish() {
    if (!this.active) return;
    const plan = this.plan(), now = this.time.now(), area = bufferBounds(this.viewport.bounds);
    const newest = new Map<string, { place: MapPlace; version: number }>();
    for (const entry of this.entries.values()) for (const place of entry.places) {
      if (area.some((bounds) => containsPoint(bounds, place.location)) && (newest.get(place.place_id)?.version ?? -1) < entry.version) {
        newest.set(place.place_id, { place, version: entry.version });
      }
    }
    const old = new Map(this.view.places.map((place) => [place.place_id, place]));
    const rows = [...newest.values()].map(({ place }) => {
      const previous = old.get(place.place_id);
      return previous && JSON.stringify(previous) === JSON.stringify(place) ? previous : place;
    });
    const places = rows.length === this.view.places.length && rows.every((place, i) => place === this.view.places[i]) ? this.view.places : rows;
    const error = plan.pending.map((cell) => this.failures.get(cell.key)?.message).find(Boolean) ?? "";
    const waiting = plan.pending.length > 0 && this.budget.retryAt(now) > now;
    this.view = { places, error, waiting, zoomIn: this.viewport.bounds.length > 0 && !plan.roots.length,
      loading: plan.pending.length > 0 && !waiting && !error,
      complete: plan.roots.length > 0 && plan.pending.length === 0 };
    this.notify(this.view);
  }

  private prune(area: MapBounds[]) {
    const required = new Set(this.plan().required.map((cell) => cell.key));
    for (const [key, entry] of this.entries) if (!required.has(key) && this.time.now() - entry.fetched >= 3 * FRESH_MS) {
      this.entries.delete(key); this.failures.delete(key);
    }
    const offscreen = [...this.entries].filter(([, entry]) => !area.some((bounds) => intersects(bounds, entry.cell.bounds)))
      .sort((a, b) => a[1].version - b[1].version);
    for (const [key, entry] of offscreen) {
      if (this.entries.size <= 256 && this.time.now() - entry.fetched < 3 * FRESH_MS) continue;
      this.entries.delete(key); this.failures.delete(key);
    }
    // Failed offscreen searches have no cache entry to evict.
    for (const key of this.failures.keys()) if (!this.entries.has(key) && !required.has(key)) this.failures.delete(key);
  }
}
