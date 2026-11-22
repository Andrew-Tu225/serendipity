import type { MapBounds } from "@/types/discovery";
import type { Coordinates, MapPlace } from "@/types/places";
import { containsPoint, intersects, uncoveredBounds } from "./bounds";

export const DISCOVERY_FRESH_MS = 60_000;
const MAX_REGIONS = 32;
const MAX_PLACES = 5_000;
interface Coverage { bounds: MapBounds; completedAt: number; touchedAt: number }
interface Entry { place: MapPlace; signature: string; version: number; touchedAt: number }

/** App-owned data only; scoped to one mounted map and the verified viewer. */
export class DiscoveryCache {
  private entries = new Map<string, Entry>();
  private regions: Coverage[] = [];
  version = 0;

  get(id: string) { return this.entries.get(id)?.place; }

  merge(places: MapPlace[], now: number) {
    for (const place of places) {
      if (place.source !== "app") continue;
      const signature = JSON.stringify(place);
      const previous = this.entries.get(place.place_id);
      this.entries.set(place.place_id, {
        place: previous?.signature === signature ? previous.place : place,
        signature, version: ++this.version, touchedAt: now,
      });
    }
  }

  read(areas: MapBounds[], now: number) {
    const result: MapPlace[] = [];
    for (const entry of this.entries.values()) {
      if (areas.some((area) => containsPoint(area, entry.place.location))) {
        entry.touchedAt = now;
        result.push(entry.place);
      }
    }
    return result;
  }

  missing(areas: MapBounds[], now: number, pending: MapBounds[] = []) {
    return uncoveredBounds(areas, [
      ...this.regions.filter((region) => now - region.completedAt < DISCOVERY_FRESH_MS).map((region) => region.bounds),
      ...pending,
    ]);
  }

  touch(areas: MapBounds[], now: number) {
    for (const region of this.regions) {
      if (areas.some((area) => intersects(area, region.bounds))) region.touchedAt = now;
    }
  }

  complete(bounds: MapBounds, seen: Set<string>, startedVersion: number, now: number) {
    // Only complete pagination establishes coverage or removes records missing from the area.
    for (const [id, entry] of this.entries) {
      if (entry.version <= startedVersion && containsPoint(bounds, entry.place.location) && !seen.has(id)) this.entries.delete(id);
    }
    this.regions = this.regions.filter((region) => uncoveredBounds([region.bounds], [bounds]).length !== 0);
    this.regions.push({ bounds, completedAt: now, touchedAt: now });
  }

  invalidateAt(point: Coordinates) {
    this.regions = this.regions.filter((region) => !containsPoint(region.bounds, point));
  }

  clearPersonalization() {
    this.regions = [];
    this.merge([...this.entries.values()].map(({ place }) => ({ ...place, friend: undefined, friend_count: 0 })), Date.now());
  }

  nextExpiry(areas: MapBounds[], now: number) {
    const expiries = this.regions.filter((region) => areas.some((area) => intersects(area, region.bounds)))
      .map((region) => region.completedAt + DISCOVERY_FRESH_MS).filter((expiry) => expiry > now);
    return expiries.length ? Math.min(...expiries) : now + DISCOVERY_FRESH_MS;
  }

  prune(active: MapBounds[]) {
    const candidates = this.regions.filter((region) => !active.some((area) => intersects(area, region.bounds)))
      .sort((a, b) => a.touchedAt - b.touchedAt);
    while (this.regions.length > MAX_REGIONS && candidates.length) {
      const remove = candidates.shift()!;
      this.regions = this.regions.filter((region) => region !== remove);
    }
    for (const [id, entry] of this.entries) {
      if (!active.some((area) => containsPoint(area, entry.place.location)) &&
        !this.regions.some((region) => containsPoint(region.bounds, entry.place.location))) this.entries.delete(id);
    }
    const unused = [...this.entries.entries()].filter(([, entry]) => !active.some((area) => containsPoint(area, entry.place.location)))
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt);
    while (this.entries.size > MAX_PLACES && unused.length) {
      const [id, entry] = unused.shift()!;
      this.entries.delete(id);
      // An evicted record invalidates the promise of complete coverage there.
      this.invalidateAt(entry.place.location);
    }
  }
}
