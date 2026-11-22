import type { MapBounds } from "@/types/discovery";
import type { Coordinates } from "@/types/places";

export function intersects(a: MapBounds, b: MapBounds) {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}

export function containsPoint(bounds: MapBounds, point: Coordinates) {
  return point.latitude >= bounds.south && point.latitude <= bounds.north &&
    point.longitude >= bounds.west && point.longitude <= bounds.east;
}

export function subtractBounds(area: MapBounds, covered: MapBounds): MapBounds[] {
  if (!intersects(area, covered)) return [area];
  const west = Math.max(area.west, covered.west), east = Math.min(area.east, covered.east);
  const south = Math.max(area.south, covered.south), north = Math.min(area.north, covered.north);
  return [
    { ...area, north: south }, { ...area, south: north },
    { west: area.west, east: west, south, north },
    { west: east, east: area.east, south, north },
  ].filter((rectangle) => rectangle.west < rectangle.east && rectangle.south < rectangle.north);
}

export function uncoveredBounds(areas: MapBounds[], covered: MapBounds[]) {
  return covered.reduce((remaining, rectangle) => remaining.flatMap((area) => subtractBounds(area, rectangle)), areas);
}

export function bufferBounds(areas: MapBounds[], padding = .25): MapBounds[] {
  if (!areas.length) return [];
  const west = areas[0].west;
  const east = areas[areas.length - 1].east + (areas.length > 1 ? 360 : 0);
  const width = east - west, height = areas[0].north - areas[0].south;
  const south = Math.max(-90, areas[0].south - height * padding);
  const north = Math.min(90, areas[0].north + height * padding);
  if (width * (1 + 2 * padding) >= 360) return [{ west: -180, east: 180, south, north }];
  let left = west - width * padding, right = east + width * padding;
  while (left < -180) { left += 360; right += 360; }
  while (left >= 180) { left -= 360; right -= 360; }
  return right <= 180 ? [{ west: left, east: right, south, north }] : [
    { west: left, east: 180, south, north }, { west: -180, east: right - 360, south, north },
  ];
}
