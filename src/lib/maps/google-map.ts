import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MarkerLayer } from "./layers";
import { visibleNearbyPins, type PinBounds, type NearbyPinBounds } from "./declutter";
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
  const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
  signal.throwIfAborted();
  const map = new GoogleMap(host, {
    center: latLng(LONDON), zoom: 13, mapId,
    disableDefaultUI: true, clickableIcons: false,
    gestureHandling: "greedy", keyboardShortcuts: false,
  });
  const groupMarkers = new Map<google.maps.marker.AdvancedMarkerElement, google.maps.LatLng>();
  const clusters = new MarkerClusterer({ map, renderer: {
    render({ count, position }) {
      const content = document.createElement("span");
      content.className = "discovery-cluster";
      content.textContent = String(count);
      const marker = new AdvancedMarkerElement({ position, content, title: `Zoom to ${count} places`, zIndex: 500, collisionBehavior: google.maps.CollisionBehavior.REQUIRED });
      groupMarkers.set(marker, position);
      return marker;
    },
  } });
  let frame = 0;
  let destroyed = false;
  const selectedMarkers = new Set<google.maps.marker.AdvancedMarkerElement>();
  interface Pin {
    id: number; position: Coordinates; marker: google.maps.marker.AdvancedMarkerElement;
    layer: MarkerLayer; selected: boolean; visible: boolean;
  }
  const pins = new Set<Pin>();
  let serial = 0;
  let settling: ReturnType<typeof setTimeout>;
  let moving = false;
  function declutter() {
    if (destroyed || moving) return;
    const projection = map.getProjection();
    const center = map.getCenter();
    const origin = center && projection?.fromLatLngToPoint(center);
    if (!projection || !origin) return;
    const scale = 2 ** (map.getZoom() ?? 13);
    function bounds(position: Coordinates, width: number, height: number): PinBounds | undefined {
      const point = projection!.fromLatLngToPoint(new google.maps.LatLng(latLng(position)));
      if (!point) return;
      // Use the nearest world copy across the date line. Coordinates are CSS pixels.
      const dx = ((point.x - origin!.x + 128) % 256 + 256) % 256 - 128;
      return { x: dx * scale, y: (point.y - origin!.y) * scale, width, height };
    }
    const foreground: PinBounds[] = [];
    const nearby: NearbyPinBounds[] = [];
    for (const pin of pins) {
      const box = bounds(pin.position, 130, pin.layer === "place" ? 62 : 84);
      if (!box) continue;
      if (pin.layer === "place" && !pin.selected) nearby.push({ ...box, id: pin.id, visible: pin.visible });
      else foreground.push(box);
    }
    for (const [marker, position] of groupMarkers) {
      if (marker.map !== map) { groupMarkers.delete(marker); continue; }
      const box = bounds({ latitude: position.lat(), longitude: position.lng() }, 54, 54);
      if (box) foreground.push(box);
    }
    if (locationPosition) {
      const box = bounds(locationPosition, 32, 32);
      if (box) foreground.push(box);
    }
    const visible = visibleNearbyPins(nearby, foreground);
    for (const pin of pins) if (pin.layer === "place" && !pin.selected) {
      const next = visible.has(pin.id);
      pin.visible = next;
      if (pin.marker.map !== (next ? map : null)) pin.marker.map = next ? map : null;
    }
  }
  function settle() {
    clearTimeout(settling);
    if (!destroyed) settling = setTimeout(declutter, 150);
  }
  const motion = map.addListener("bounds_changed", () => { moving = true; clearTimeout(settling); });
  const idle = map.addListener("idle", () => { moving = false; settle(); });
  const clustered = google.maps.event.addListener(clusters, "clusteringend", settle);
  const renderClusters = () => {
    if (destroyed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      clusters.render();
      selectedMarkers.forEach((marker) => { if (marker.map !== map) marker.map = map; });
      settle();
    });
  };
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
      const priorities: Record<MarkerLayer, number> = { place: 1, review: 10, recommendation: 20, friend: 30 };
      function visibility() {
        return {
          zIndex: selection ? 1000 : priorities[layer],
          collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
        };
      }
      const marker = new AdvancedMarkerElement({ map: layer === "place" ? null : map, position: latLng(position), content: element, title, ...visibility() });
      const pin: Pin = { id: ++serial, marker, position, layer, selected: false, visible: layer !== "place" };
      pins.add(pin);
      let inCluster = false;
      function membership() {
        const next = cluster && layer !== "place" && !selection;
        if (next === inCluster) return;
        inCluster = next;
        if (next) clusters.addMarker(marker, true);
        else clusters.removeMarker(marker, true);
        renderClusters();
      }
      function applyVisibility() {
        const options = visibility();
        marker.zIndex = options.zIndex;
        marker.collisionBehavior = options.collisionBehavior;
      }
      membership();
      settle();
      const listener = marker.addListener("click", onClick);
      return {
        layer(value) {
          if (layer === value) return;
          layer = value; pin.layer = value;
          applyVisibility(); membership();
          if (selection || layer !== "place") { pin.visible = true; if (marker.map !== map) marker.map = map; }
          settle();
        },
        title(value) { marker.title = value; },
        select(selected) {
          if (selection === selected) return;
          selection = selected;
          pin.selected = selected;
          element.classList.toggle("is-selected", selected);
          applyVisibility();
          if (selected) selectedMarkers.add(marker); else selectedMarkers.delete(marker);
          membership();
          if (selected) { pin.visible = true; if (marker.map !== map) marker.map = map; }
          settle();
        },
        remove() {
          listener.remove();
          selectedMarkers.delete(marker);
          pins.delete(pin);
          if (inCluster) { clusters.removeMarker(marker, true); renderClusters(); }
          marker.map = null;
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
      motion.remove(); idle.remove(); clustered.remove();
      for (const pin of pins) pin.marker.map = null;
      pins.clear(); groupMarkers.clear();
      clusters.clearMarkers(true);
      clusters.setMap(null);
      authenticationListeners.delete(onAuthenticationFailure);
      if (locationMarker) locationMarker.map = null;
      google.maps.event.clearInstanceListeners(map);
      host.replaceChildren();
    },
  };
}
