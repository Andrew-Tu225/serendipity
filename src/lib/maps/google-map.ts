import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { MarkerLayer } from "./layers";
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
  const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
    importLibrary("maps"), importLibrary("marker"),
  ]);
  signal.throwIfAborted();
  if (authenticationFailed) throw new Error("Google Maps authorization failed. Please check the map configuration.");
  const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
  signal.throwIfAborted();
  const map = new Map(host, {
    center: latLng(LONDON), zoom: 13, mapId,
    disableDefaultUI: true, clickableIcons: false,
    gestureHandling: "greedy", keyboardShortcuts: false,
  });
  const clusters = new MarkerClusterer({ map, renderer: {
    render({ count, position }) {
      const content = document.createElement("span");
      content.className = "discovery-cluster";
      content.textContent = String(count);
      return new AdvancedMarkerElement({ position, content, title: `Zoom to ${count} places`, zIndex: 500, collisionBehavior: google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL });
    },
  } });
  let frame = 0;
  let destroyed = false;
  const selectedMarkers = new Set<google.maps.marker.AdvancedMarkerElement>();
  const renderClusters = () => {
    if (destroyed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      clusters.render();
      selectedMarkers.forEach((marker) => { marker.map = map; });
    });
  };
  let locationMarker: google.maps.marker.AdvancedMarkerElement | undefined;
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
      if (locationMarker) locationMarker.map = null;
      const dot = document.createElement("span");
      dot.className = "discovery-location-dot";
      locationMarker = new AdvancedMarkerElement({ map, position: latLng(position), content: dot, title: "Your location", zIndex: 2000, collisionBehavior: google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL });
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
          collisionBehavior: !selection && layer === "place"
            ? google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
            : google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL,
        };
      }
      const marker = new AdvancedMarkerElement({ map, position: latLng(position), content: element, title, ...visibility() });
      function applyVisibility() {
        const options = visibility();
        marker.zIndex = options.zIndex;
        marker.collisionBehavior = options.collisionBehavior;
      }
      if (cluster) { clusters.addMarker(marker, true); renderClusters(); }
      const listener = marker.addListener("click", onClick);
      return {
        layer(value) { if (layer !== value) { layer = value; applyVisibility(); } },
        title(value) { marker.title = value; },
        select(selected) {
          if (selection === selected) return;
          selection = selected;
          element.classList.toggle("is-selected", selected);
          applyVisibility();
          if (cluster) {
            if (selected) { selectedMarkers.add(marker); clusters.removeMarker(marker, true); marker.map = map; }
            else { selectedMarkers.delete(marker); clusters.addMarker(marker, true); }
            renderClusters();
          }
        },
        remove() {
          listener.remove();
          selectedMarkers.delete(marker);
          if (cluster) { clusters.removeMarker(marker, true); renderClusters(); }
          marker.map = null;
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
      clusters.clearMarkers(true);
      clusters.setMap(null);
      authenticationListeners.delete(onAuthenticationFailure);
      if (locationMarker) locationMarker.map = null;
      google.maps.event.clearInstanceListeners(map);
      host.replaceChildren();
    },
  };
}
