import type { MapBounds } from "@/types/discovery";
import type { MapPlace, PlaceDetails } from "@/types/places";

// Fixed zoom-13 cells avoid repeating a paid provider search after every small pan.
// These are sampled search areas, never a claim of exhaustive provider coverage.
const SIZE = 8192;
const MAX_CELLS = 9;
const latitude = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / SIZE))) * 180 / Math.PI;
const tileY = (lat: number) => {
  const radians = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return Math.max(0, Math.min(SIZE - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * SIZE)));
};
export function nearbyCells(bounds: MapBounds[]) {
  const cells = new Map<string, { key: string; center: { latitude: number; longitude: number }; radius: number }>();
  for (const area of bounds) {
    const left = Math.max(0, Math.floor((area.west + 180) / 360 * SIZE));
    const right = Math.min(SIZE - 1, Math.floor((area.east + 180) / 360 * SIZE));
    const top = tileY(area.north), bottom = tileY(area.south);
    if ((right - left + 1) * (bottom - top + 1) > MAX_CELLS) return [];
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      const lat = latitude(y + .5);
      const halfWidth = 40075017 / SIZE * Math.cos(lat * Math.PI / 180) / 2;
      cells.set(`${x}:${y}`, { key: `${x}:${y}`, center: { latitude: lat, longitude: (x + .5) / SIZE * 360 - 180 }, radius: Math.max(50, Math.ceil(halfWidth * Math.SQRT2 * 1.01)) });
      if (cells.size > MAX_CELLS) return [];
    }
  }
  return [...cells.values()];
}

export function nearbyPlace(place: PlaceDetails): MapPlace {
  const types = place.types ?? [];
  const category = types.some((type) => ["food", "restaurant", "cafe", "bakery", "bar"].includes(type)) ? "Food"
    : types.some((type) => ["park", "hiking_area", "natural_feature", "zoo"].includes(type)) ? "Outdoors"
    : types.some((type) => ["museum", "art_gallery", "library", "performing_arts_theater"].includes(type)) ? "Culture"
    : types.some((type) => type.endsWith("_store") || type === "shopping_mall") ? "Shop" : "Activity";
  return { ...place, source: "google", category };
}
