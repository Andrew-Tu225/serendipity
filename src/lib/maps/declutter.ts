export interface PinBounds { x: number; y: number; width: number; height: number }
export interface NearbyPinBounds extends PinBounds { id: number; visible: boolean }

function overlaps(a: PinBounds, b: PinBounds, gap: number) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    a.y - a.height < b.y + gap && b.y - b.height < a.y + gap;
}

/** Keep existing grey pins first; a little extra clearance prevents edge oscillation. */
export function visibleNearbyPins(pins: NearbyPinBounds[], foreground: PinBounds[]) {
  const occupied = [...foreground];
  const visible = new Set<number>();
  for (const pin of [...pins].sort((a, b) => Number(b.visible) - Number(a.visible) || a.id - b.id)) {
    if (occupied.some((other) => overlaps(pin, other, pin.visible ? 2 : 10))) continue;
    visible.add(pin.id);
    occupied.push(pin);
  }
  return visible;
}
