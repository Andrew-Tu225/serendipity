import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { Coordinates, PlaceDetails } from "@/types/places";

export const TORONTO = { latitude: 43.651, longitude: -79.386 };

export interface MapHandle {
  center(): Coordinates;
  focus(place: Pick<PlaceDetails, "location" | "viewport">): void;
  locate(position: Coordinates): void;
  marker(position: Coordinates, element: HTMLElement, title: string, onClick: () => void): {
    select(selected: boolean): void;
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
  const map = new Map(host, {
    center: latLng(TORONTO), zoom: 13, mapId,
    disableDefaultUI: true, zoomControl: true, clickableIcons: false,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
    gestureHandling: "greedy", keyboardShortcuts: true,
  });
  let locationMarker: google.maps.marker.AdvancedMarkerElement | undefined;
  authenticationListeners.add(onAuthenticationFailure);
  return {
    center() {
      const center = map.getCenter();
      return center ? { latitude: center.lat(), longitude: center.lng() } : TORONTO;
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
      locationMarker = new AdvancedMarkerElement({ map, position: latLng(position), content: dot, title: "Your location", zIndex: 2000 });
      map.setZoom(15);
      map.panTo(latLng(position));
    },
    marker(position, element, title, onClick) {
      const marker = new AdvancedMarkerElement({ map, position: latLng(position), content: element, title, zIndex: 1 });
      const listener = marker.addListener("click", onClick);
      return {
        select(selected) {
          element.classList.toggle("is-selected", selected);
          marker.zIndex = selected ? 1000 : 1;
          marker.collisionBehavior = selected
            ? google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
            : google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY;
        },
        remove() { listener.remove(); marker.map = null; },
      };
    },
    resize() {
      const center = map.getCenter();
      google.maps.event.trigger(map, "resize");
      if (center) map.setCenter(center);
    },
    destroy() {
      authenticationListeners.delete(onAuthenticationFailure);
      if (locationMarker) locationMarker.map = null;
      google.maps.event.clearInstanceListeners(map);
      host.replaceChildren();
    },
  };
}
