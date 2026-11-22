import type { MapBounds } from "@/types/discovery";
import type { Coordinates, MapPlace, PlaceDetails } from "@/types/places";

// Quantized levels preserve small-pan reuse while zooming reveals finer samples.
// These search cells never claim exhaustive provider coverage.
const MAX_CELLS = 9;
function cellsAtLevel(bounds: MapBounds[], level: number) {
  const size = 2 ** level;
  const latitude = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI;
  const tileY = (lat: number) => {
    const radians = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return Math.max(0, Math.min(size - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * size)));
  };
  const cells = new Map<string, { key: string; center: { latitude: number; longitude: number }; radius: number }>();
  for (const area of bounds) {
    const left = Math.max(0, Math.floor((area.west + 180) / 360 * size));
    const right = Math.min(size - 1, Math.floor((area.east + 180) / 360 * size));
    const top = tileY(area.north), bottom = tileY(area.south);
    if ((right - left + 1) * (bottom - top + 1) > MAX_CELLS) return [];
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const lat = latitude(y + .5);
      const halfWidth = 40075017 / size * Math.cos(lat * Math.PI / 180) / 2;
      const key = `${level}:${x}:${y}`;
      cells.set(key, { key, center: { latitude: lat, longitude: (x + .5) / size * 360 - 180 }, radius: Math.max(50, Math.ceil(halfWidth * Math.SQRT2 * 1.01)) });
      if (cells.size > MAX_CELLS) return [];
    }
  }
  return [...cells.values()];
}

export function nearbyCells(bounds: MapBounds[], zoom = 13) {
  const desired = Math.max(13, Math.min(16, Math.floor(zoom) - 1));
  for (let level = desired; level >= 13; level--) {
    const cells = cellsAtLevel(bounds, level);
    if (cells.length) return cells;
  }
  return [];
}

export const NEARBY_REQUESTS_PER_MINUTE = 18;
export class NearbyRequestBudget {
  private requests: number[] = [];
  retryAt(now: number) {
    this.requests = this.requests.filter((time) => time > now - 60_000);
    return this.requests.length >= NEARBY_REQUESTS_PER_MINUTE ? this.requests[0] + 60_000 : now;
  }
  take(now: number) {
    if (this.retryAt(now) > now) return false;
    this.requests.push(now);
    return true;
  }
}

export function prioritizeNearbyCells(cells: ReturnType<typeof nearbyCells>, center: Coordinates) {
  const distance = (point: Coordinates) => {
    const longitude = ((point.longitude - center.longitude + 540) % 360 - 180) * Math.cos(center.latitude * Math.PI / 180);
    return (point.latitude - center.latitude) ** 2 + longitude ** 2;
  };
  return [...cells].sort((a, b) => distance(a.center) - distance(b.center));
}

export function nearbyPlace(place: PlaceDetails): MapPlace {
  const types = place.types ?? [];
  const category = types.some((type) => ["food", "restaurant", "cafe", "bakery", "bar"].includes(type)) ? "Food"
    : types.some((type) => ["park", "hiking_area", "natural_feature", "zoo"].includes(type)) ? "Outdoors"
    : types.some((type) => ["museum", "art_gallery", "library", "performing_arts_theater"].includes(type)) ? "Culture"
    : types.some((type) => type.endsWith("_store") || type === "shopping_mall") ? "Shop" : "Activity";
  return { ...place, source: "google", category };
}
