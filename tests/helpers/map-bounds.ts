import type { MapBounds } from "../../src/types/discovery";

// Actual Mercator bounds of a 430 x 740 map, rather than a zoom-independent SDK stub.
export function phoneBounds(latitude: number, longitude: number, zoom: number): MapBounds {
  const scale = 256 * 2 ** zoom;
  const x = (longitude + 180) / 360 * scale;
  const sine = Math.sin(latitude * Math.PI / 180);
  const y = (.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale;
  const lat = (pixel: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * pixel / scale))) * 180 / Math.PI;
  return { west: (x - 215) / scale * 360 - 180, east: (x + 215) / scale * 360 - 180,
    north: lat(y - 370), south: lat(y + 370) };
}

