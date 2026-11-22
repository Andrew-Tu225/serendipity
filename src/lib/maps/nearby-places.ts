import type { MapBounds } from "@/types/discovery";
import type { Coordinates, MapPlace, PlaceDetails } from "@/types/places";

// Stable geographic roots are reused across camera zooms and queued for the whole viewport.
const ROOT_LEVEL = 13;
const MAX_VISIBLE_CELLS = 512;
export interface NearbyCell {
  key: string; level: number; x: number; y: number;
  bounds: MapBounds; center: Coordinates; radius: number;
}

export function nearbyCell(level: number, x: number, y: number): NearbyCell {
  const size = 2 ** level;
  const latitude = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / size))) * 180 / Math.PI;
  const lat = latitude(y + .5);
  const halfWidth = 40075017 / size * Math.cos(lat * Math.PI / 180) / 2;
  return { key: `${level}:${x}:${y}`, level, x, y,
    bounds: { west: x / size * 360 - 180, east: (x + 1) / size * 360 - 180, north: latitude(y), south: latitude(y + 1) },
    center: { latitude: lat, longitude: (x + .5) / size * 360 - 180 },
    radius: Math.max(50, Math.min(5000, Math.ceil(halfWidth * Math.SQRT2 * 1.01))) };
}

export function nearbyChildren(cell: NearbyCell) {
  return [0, 1].flatMap((dx) => [0, 1].map((dy) => nearbyCell(cell.level + 1, cell.x * 2 + dx, cell.y * 2 + dy)));
}

export function nearbyCells(bounds: MapBounds[], zoom = 13): NearbyCell[] {
  if (zoom < 9) return [];
  const size = 2 ** ROOT_LEVEL;
  const tileY = (lat: number) => {
    const radians = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    return Math.max(0, Math.min(size - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * size)));
  };
  const cells = new Map<string, NearbyCell>();
  for (const area of bounds) {
    const left = Math.max(0, Math.floor((area.west + 180) / 360 * size));
    const right = Math.min(size - 1, Math.floor((area.east + 180) / 360 * size));
    const top = tileY(area.north), bottom = tileY(area.south);
    if ((right - left + 1) * (bottom - top + 1) > MAX_VISIBLE_CELLS) return [];
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const cell = nearbyCell(ROOT_LEVEL, x, y);
      cells.set(cell.key, cell);
      if (cells.size > MAX_VISIBLE_CELLS) return [];
    }
  }
  return [...cells.values()];
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
