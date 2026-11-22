import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MarkerLayer } from "./layers";
import { visiblePinLabels, type PinBounds, type PinLabelBounds } from "./declutter";
import type { Coordinates, PlaceDetails } from "@/types/places";
import type { MapBounds } from "@/types/discovery";

export const LONDON = { latitude: 42.9849, longitude: -81.2453 };

export interface MapHandle {
  center(): Coordinates;
  zoom(): number;
  bounds(): MapBounds[];
  onIdle(callback: () => void): () => void;
  onPick(callback: (position: Coordinates) => void): () => void;
  focus(place: Pick<PlaceDetails, "location" | "viewport">): void;
  locate(position: Coordinates): void;
  marker(position: Coordinates, element: HTMLElement, title: string, onClick: () => void, cluster?: boolean, layer?: MarkerLayer): {
    layer(value: MarkerLayer): void;
    select(selected: boolean): void;
    title(value: string): void;
    remove(): void;
  };
  resize(): void;
  destroy(): void;
}

let configured = false;
let authenticationFailed = false;
const authenticationListeners = new Set<() => void>();

const latLng = (point: Coordinates) => ({ lat: point.latitude, lng: point.longitude });

export async function createGoogleMap(host: HTMLElement, signal: AbortSignal, onAuthenticationFailure: () => void): Promise<MapHandle> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ||
    (process.env.NODE_ENV === "development" ? "DEMO_MAP_ID" : "");
  if (!key || !mapId) throw new Error("The map is not configured yet.");
  if (!configured) {
    const browser = window as Window & { gm_authFailure?: () => void };
    const previous = browser.gm_authFailure;
    browser.gm_authFailure = () => {
      authenticationFailed = true;
      authenticationListeners.forEach((notify) => notify());
      previous?.();
    };
    setOptions({ key, v: "quarterly", language: "en" });
    configured = true;
  }
  const [{ Map: GoogleMap }, { AdvancedMarkerElement }] = await Promise.all([
    importLibrary("maps"), importLibrary("marker"),
  ]);
  signal.throwIfAborted();
  if (authenticationFailed) throw new Error("Google Maps authorization failed. Please check the map configuration.");
  const { StableClusters } = await import("./stable-clusters");
  signal.throwIfAborted();
  const map = new GoogleMap(host, {
    center: latLng(LONDON), zoom: 13, mapId,
    disableDefaultUI: true, clickableIcons: false,
    gestureHandling: "greedy", keyboardShortcuts: false,
  });
  const groupMarkers = new Map<google.maps.marker.AdvancedMarkerElement, google.maps.LatLng>();
  const clusters = new StableClusters(map, ({ count, position }) => {
      const content = document.createElement("span");
      content.className = "discovery-cluster";
      content.textContent = String(count);
      const marker = new AdvancedMarkerElement({ position, content, title: `Zoom to ${count} places`, gmpClickable: true, zIndex: 500, collisionBehavior: google.maps.CollisionBehavior.REQUIRED });
      groupMarkers.set(marker, position);
      return marker;
  });
  let frame = 0;
  let destroyed = false;
  const selectedMarkers = new Set<google.maps.marker.AdvancedMarkerElement>();
  interface Pin {
    id: number; position: Coordinates; marker: google.maps.marker.AdvancedMarkerElement;
    layer: MarkerLayer; selected: boolean;
    element: HTMLElement; labelVisible: boolean;
    geometry?: { icon: PinBounds; caption?: PinBounds };
    contentObserver: MutationObserver;
  }
  const pins = new Set<Pin>();
  const priorities: Record<MarkerLayer, number> = { place: 1, review: 10, friend: 20, recommendation: 30 };
  let serial = 0;
  let settling: ReturnType<typeof setTimeout>;
  let moving = false;
  function measure(pin: Pin) {
    if (pin.geometry) return pin.geometry;
    const element = pin.element;
    const root = element.getBoundingClientRect();
    function box(child: Element): PinBounds {
      const rect = child.getBoundingClientRect();
      return { x: (rect.left + rect.right - root.left - root.right) / 2,
        y: rect.bottom - root.bottom, width: rect.width, height: rect.height };
    }
    const icon = element.querySelector(".discovery-pin-icon, .discovery-friend-avatar") ?? element;
    const caption = element.querySelector(".discovery-pin-caption");
    pin.geometry = { icon: box(icon), caption: caption ? box(caption) : undefined };
    return pin.geometry;
  }
  function declutter() {
    if (destroyed || moving || !host.clientWidth || !host.clientHeight) return;
    const projection = map.getProjection();
    const center = map.getCenter();
    const origin = center && projection?.fromLatLngToPoint(center);
    if (!projection || !origin) return;
    const scale = 2 ** (map.getZoom() ?? 13);
    function bounds(position: Coordinates, shape: PinBounds): PinBounds | undefined {
      const point = projection!.fromLatLngToPoint(new google.maps.LatLng(latLng(position)));
      if (!point) return;
      // Use the nearest world copy across the date line. Coordinates are CSS pixels.
      const dx = ((point.x - origin!.x + 128) % 256 + 256) % 256 - 128;
      return { ...shape, x: dx * scale + shape.x, y: (point.y - origin!.y) * scale + shape.y };
    }
    const icons: (PinBounds & { id?: number })[] = [];
    for (const pin of pins) {
      // Hidden cluster members occupy no screen space; only their group marker does.
      if (pin.marker.map !== map) continue;
      const box = bounds(pin.position, measure(pin).icon);
      if (!box) continue;
      icons.push({ ...box, id: pin.id });
    }
    for (const [marker, position] of groupMarkers) {
      if (marker.map !== map) { groupMarkers.delete(marker); continue; }
      const rect = (marker.content as HTMLElement).getBoundingClientRect();
      const box = bounds({ latitude: position.lat(), longitude: position.lng() }, { x: 0, y: 0, width: rect.width, height: rect.height });
      if (box) icons.push(box);
    }
    if (locationPosition) {
      const rect = (locationMarker!.content as HTMLElement).getBoundingClientRect();
      const box = bounds(locationPosition, { x: 0, y: 0, width: rect.width, height: rect.height });
      if (box) icons.push(box);
    }
    const labels: PinLabelBounds[] = [];
    for (const pin of pins) {
      if (pin.marker.map !== map) continue;
      const caption = measure(pin).caption;
      const box = caption && bounds(pin.position, caption);
      if (box) labels.push({ ...box, id: pin.id, visible: pin.labelVisible,
        priority: pin.selected ? 1000 : priorities[pin.layer], selected: pin.selected });
    }
    const labelled = visiblePinLabels(labels, icons);
    for (const pin of pins) {
      const next = labelled.has(pin.id);
      if (pin.labelVisible === next) continue;
      pin.labelVisible = next;
      pin.element.classList.toggle("has-label", next);
    }
  }
  function settle() {
    clearTimeout(settling);
    if (!destroyed) settling = setTimeout(declutter, 150);
  }
  const resized = new ResizeObserver(() => {
    for (const pin of pins) pin.geometry = undefined;
    settle();
  });
  resized.observe(host);
  const motion = map.addListener("bounds_changed", () => {
    moving = true;
    cancelAnimationFrame(frame);
    clearTimeout(settling);
  });
  const idle = map.addListener("idle", () => { moving = false; renderClusters(); });
  function renderClusters() {
    if (destroyed || moving) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (destroyed || moving) return;
      clusters.render();
      selectedMarkers.forEach((marker) => { if (marker.map !== map) marker.map = map; });
      settle();
    });
  }
  let locationMarker: google.maps.marker.AdvancedMarkerElement | undefined;
  let locationPosition: Coordinates | undefined;
  authenticationListeners.add(onAuthenticationFailure);
  return {
    zoom() { return map.getZoom() ?? 13; },
    bounds() {
      const bounds = map.getBounds()?.toJSON();
      if (!bounds || bounds.south >= bounds.north) return [];
      if (bounds.west <= bounds.east) return [bounds];
      // The API uses ordinary rectangles; split a viewport crossing the date line.
      return [
        { ...bounds, east: 180 }, { ...bounds, west: -180 },
      ].filter((part) => part.west < part.east);
    },
    onIdle(callback) {
      const listener = map.addListener("idle", callback);
      return () => listener.remove();
    },
    onPick(callback) {
      const listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (event.latLng) callback({ latitude: event.latLng.lat(), longitude: event.latLng.lng() });
      });
      return () => listener.remove();
    },
    center() {
      const center = map.getCenter();
      return center ? { latitude: center.lat(), longitude: center.lng() } : LONDON;
    },
    focus(place) {
      if (place.viewport) {
        map.fitBounds({
          south: place.viewport.low.latitude, west: place.viewport.low.longitude,
          north: place.viewport.high.latitude, east: place.viewport.high.longitude,
        }, { top: 60, right: 45, bottom: 160, left: 45 });
      } else {
        map.setZoom(16);
        map.panTo(latLng(place.location));
      }
    },
    locate(position) {
      locationPosition = position;
      if (locationMarker) locationMarker.map = null;
      const dot = document.createElement("span");
      dot.className = "discovery-location-dot";
      locationMarker = new AdvancedMarkerElement({ map, position: latLng(position), content: dot, title: "Your location", zIndex: 2000, collisionBehavior: google.maps.CollisionBehavior.REQUIRED });
      map.setZoom(15);
      map.panTo(latLng(position));
    },
    marker(position, element, title, onClick, cluster = true, initialLayer = "review") {
      let layer = initialLayer;
      let selection = false;
      function visibility() {
        return {
          zIndex: selection ? 1000 : priorities[layer],
          collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
        };
      }
      const marker = new AdvancedMarkerElement({ map: cluster ? null : map, position: latLng(position), content: element, title, gmpClickable: true, ...visibility() });
      const contentObserver = new MutationObserver(() => { pin.geometry = undefined; settle(); });
      const pin: Pin = { id: ++serial, marker, position, layer, selected: false,
        element, labelVisible: false, contentObserver };
      pins.add(pin);
      contentObserver.observe(element, { childList: true, characterData: true, subtree: true });
      resized.observe(element);
      const caption = element.querySelector(".discovery-pin-caption");
      if (caption) resized.observe(caption);
      let inCluster = false;
      function membership() {
        const next = cluster && !selection;
        if (next === inCluster) return;
        inCluster = next;
        if (next) clusters.addMarker(marker);
        else clusters.removeMarker(marker, selection);
        renderClusters();
      }
      function applyVisibility() {
        const options = visibility();
        marker.zIndex = options.zIndex;
        marker.collisionBehavior = options.collisionBehavior;
      }
      membership();
      settle();
      marker.addEventListener("gmp-click", onClick);
      return {
        layer(value) {
          if (layer === value) return;
          layer = value; pin.layer = value;
          pin.geometry = undefined;
          applyVisibility(); membership();
          // Cluster membership owns attachment; a colour update cannot reveal a hidden member.
          if (!inCluster && marker.map !== map) marker.map = map;
          settle();
        },
        title(value) { marker.title = value; },
        select(selected) {
          if (selection === selected) return;
          selection = selected;
          pin.selected = selected;
          pin.geometry = undefined;
          element.classList.toggle("is-selected", selected);
          applyVisibility();
          if (selected) selectedMarkers.add(marker); else selectedMarkers.delete(marker);
          membership();
          if (selected && marker.map !== map) marker.map = map;
          settle();
        },
        remove() {
          marker.removeEventListener("gmp-click", onClick);
          contentObserver.disconnect();
          resized.unobserve(element);
          if (caption) resized.unobserve(caption);
          selectedMarkers.delete(marker);
          pins.delete(pin);
          if (inCluster) { clusters.removeMarker(marker); renderClusters(); }
          if (marker.map != null) marker.map = null;
          settle();
        },
      };
    },
    resize() {
      const center = map.getCenter();
      google.maps.event.trigger(map, "resize");
      if (center) map.setCenter(center);
    },
    destroy() {
      destroyed = true;
      selectedMarkers.clear();
      cancelAnimationFrame(frame);
      clearTimeout(settling);
      motion.remove(); idle.remove();
      resized.disconnect();
      for (const pin of pins) { pin.contentObserver.disconnect(); if (pin.marker.map != null) pin.marker.map = null; }
      pins.clear(); groupMarkers.clear();
      clusters.destroy();
      authenticationListeners.delete(onAuthenticationFailure);
      if (locationMarker) locationMarker.map = null;
      google.maps.event.clearInstanceListeners(map);
      host.replaceChildren();
    },
  };
}
