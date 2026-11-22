export interface PinBounds { x: number; y: number; width: number; height: number }
export interface NearbyPinBounds extends PinBounds { id: number; visible: boolean }
export interface PinLabelBounds extends NearbyPinBounds { priority: number; selected: boolean }

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

/** Labels yield before icons; selected Places always retain their name. */
export function visiblePinLabels(labels: PinLabelBounds[], icons: (PinBounds & { id?: number })[]) {
  const occupied = [...icons];
  const visible = new Set<number>();
  for (const label of [...labels].sort((a, b) => b.priority - a.priority || Number(b.visible) - Number(a.visible) || a.id - b.id)) {
    if (!label.selected && occupied.some((other) => other.id !== label.id && overlaps(label, other, label.visible ? 2 : 4))) continue;
    visible.add(label.id);
    occupied.push(label);
  }
  return visible;
}
