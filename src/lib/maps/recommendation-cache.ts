import type { MapBounds } from "@/types/discovery";
import type { MapPlace } from "@/types/places";
import { bufferBounds, uncoveredBounds } from "./bounds";

export const RECOMMENDATION_FRESH_MS = 60_000;
const MAX_AREAS = 8;
export const coversViewport = (coverage: MapBounds[], visible: MapBounds[]) => uncoveredBounds(visible, coverage).length === 0;

interface Snapshot { bounds: MapBounds[]; places: MapPlace[]; fetchedAt: number }

/** Viewer-private, complete rankings. A limited ranking is never exhaustive place coverage. */
export class RecommendationCache {
  private areas = new Map<string, Snapshot>();
  private active: Snapshot | null = null;

  fresh(visible: MapBounds[], now: number) {
    const fresh = (entry: Snapshot) => now - entry.fetchedAt < RECOMMENDATION_FRESH_MS && coversViewport(entry.bounds, visible);
    const cached = this.active && fresh(this.active) ? this.active : [...this.areas.values()].reverse().find(fresh);
    if (cached) this.active = cached;
    return cached;
  }

  areaFor(visible: MapBounds[]) {
    const previous = this.active && coversViewport(this.active.bounds, visible) ? this.active
      : [...this.areas.values()].reverse().find((entry) => coversViewport(entry.bounds, visible));
    return previous?.bounds ?? bufferBounds(visible);
  }

  remember(bounds: MapBounds[], places: MapPlace[], now: number) {
    const key = bounds.map((area) => [area.west, area.south, area.east, area.north].map((n) => n.toFixed(7)).join(",")).join(";");
    this.active = { bounds, places, fetchedAt: now };
    this.areas.delete(key);
    this.areas.set(key, this.active);
    while (this.areas.size > MAX_AREAS) this.areas.delete(this.areas.keys().next().value!);
  }

  clear() { this.areas.clear(); this.active = null; }
}
