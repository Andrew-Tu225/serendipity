import type { Page } from "@playwright/test";

// Substitute only the external SDK. The production map adapter, marker lifecycle,
// search components, API client, and camera calls still execute in browser tests.
const sdk = String.raw`
(() => {
  let currentMap;
  const markers = new Set();
  class TestMap {
    constructor(host, options) {
      this.host = host;
      this.position = options.center;
      host.replaceChildren();
      host.style.background = '#e9e3ed';
      this.setCenter(options.center);
      this.setZoom(options.zoom);
      currentMap = this;
    }
    getCenter() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
    setCenter(position) {
      this.position = typeof position.lat === 'function' ? { lat: position.lat(), lng: position.lng() } : position;
      this.host.dataset.center = JSON.stringify(this.position);
    }
    panTo(position) { this.setCenter(position); }
    setZoom(zoom) { this.host.dataset.zoom = String(zoom); }
    fitBounds(bounds) {
      this.host.dataset.bounds = JSON.stringify(bounds);
      this.setCenter({ lat: (bounds.north + bounds.south)/2, lng: (bounds.east + bounds.west)/2 });
    }
  }
  class TestMarker {
    constructor(options) {
      this.node = document.createElement('button');
      this.node.type = 'button';
      this.node.setAttribute('aria-label', options.title);
      this.node.dataset.position = JSON.stringify(options.position);
      this.node.style.cssText = 'position:absolute;border:0;background:transparent;left:40%;top:35%';
      this.node.append(options.content);
      markers.add(this);
      this.map = options.map;
    }
    set map(map) {
      if (!map) { this.node.remove(); return; }
      map.host.append(this.node);
      const i = [...markers].indexOf(this);
      this.node.style.left = (10 + (i % 3)*28) + '%';
      this.node.style.top = (20 + Math.floor(i/3)*25) + '%';
    }
    addListener(name, callback) {
      this.node.addEventListener(name, callback);
      return { remove: () => this.node.removeEventListener(name, callback) };
    }
  }
  const maps = window.google.maps;
  maps.ControlPosition = { RIGHT_CENTER: 'right-center' };
  maps.CollisionBehavior = { REQUIRED_AND_HIDES_OPTIONAL: 'required', OPTIONAL_AND_HIDES_LOWER_PRIORITY: 'optional' };
  maps.event = { trigger() {}, clearInstanceListeners() {} };
  maps.importLibrary = async (name) => name === 'maps' ? { Map: TestMap } : { AdvancedMarkerElement: TestMarker };
  window.__panTestMap = (lat, lng) => currentMap.panTo({ lat, lng });
  maps.__ib__();
})();
`;

export async function mockGoogleMaps(page: Page, failFirst = false) {
  let loads = 0;
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("https://maps.googleapis.com/maps/api/js?**", async (route) => {
    loads++;
    if (failFirst && loads === 1) return route.abort();
    await route.fulfill({ contentType: "application/javascript", body: sdk });
  });
  return () => loads;
}
