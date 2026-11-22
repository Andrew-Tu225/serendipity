export interface PinBounds { x: number; y: number; width: number; height: number }
export interface PinLabelBounds extends PinBounds { id: number; visible: boolean; priority: number; selected: boolean }

function overlaps(a: PinBounds, b: PinBounds, gap: number) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    a.y - a.height < b.y + gap && b.y - b.height < a.y + gap;
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
