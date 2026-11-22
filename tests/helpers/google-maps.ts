import type { Page } from "@playwright/test";

// Substitute only the external SDK. The production map adapter, marker lifecycle,
// search components, API client, and camera calls still execute in browser tests.
const sdk = String.raw`
(() => {
  let currentMap;
  let markerSerial = 0;
  const markers = new Set();
  const events = new WeakMap();
  function listen(target, name, callback) {
    if (!events.has(target)) events.set(target, new Map());
    const registry = events.get(target);
    if (!registry.has(name)) registry.set(name, new Set());
    registry.get(name).add(callback);
    return { remove: () => registry.get(name).delete(callback) };
  }
  function trigger(target, name, ...args) {
    for (const callback of events.get(target)?.get(name) ?? []) callback(...args);
  }
  class LatLng {
    constructor(lat, lng) { this.latitude = typeof lat === 'object' ? (typeof lat.lat === 'function' ? lat.lat() : lat.lat) : lat; this.longitude = typeof lat === 'object' ? (typeof lat.lng === 'function' ? lat.lng() : lat.lng) : lng; }
    lat() { return this.latitude; } lng() { return this.longitude; }
    toJSON() { return { lat: this.lat(), lng: this.lng() }; }
  }
  class LatLngBounds {
    constructor(sw, ne) { this.points = []; if (sw) this.extend(sw); if (ne) this.extend(ne); }
    extend(point) { this.points.push(new LatLng(point)); return this; }
    toJSON() { return { south: Math.min(...this.points.map(p => p.lat())), west: Math.min(...this.points.map(p => p.lng())), north: Math.max(...this.points.map(p => p.lat())), east: Math.max(...this.points.map(p => p.lng())) }; }
    getCenter() { const b = this.toJSON(); return new LatLng((b.south+b.north)/2,(b.west+b.east)/2); }
  }
  function OverlayView() {}
  OverlayView.prototype.setMap = function(map) { if (this.map && this.onRemove) this.onRemove(); this.map = map; if (map && this.onAdd) this.onAdd(); };
  OverlayView.prototype.getMap = function() { return this.map; };
  OverlayView.prototype.getProjection = function() { return {}; };
  class TestMap {
    constructor(host, options) {
      this.host = host;
      this.position = options.center;
      markers.clear();
      host.replaceChildren();
      host.style.background = '#e9e3ed';
      const attribution = document.createElement('div');
      attribution.setAttribute('aria-label', 'Map attribution');
      attribution.style.cssText = 'position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;padding:4px 6px;font:10px Arial,sans-serif;color:#555;background:#ffffffb3';
      attribution.innerHTML = '<span>Google</span><span>Map data · Terms</span>';
      host.append(attribution);
      this.setCenter(options.center);
      this.setZoom(options.zoom);
      currentMap = this;
      host.addEventListener('click', (event) => { if (event.target === host) trigger(this, 'click', { latLng: this.getCenter() }); });
    }
    getCenter() { return new LatLng(this.position); }
    getBounds() { const p=this.position; return { toJSON: () => this.bounds ?? { south:p.lat-.1,west:p.lng-.1,north:p.lat+.1,east:p.lng+.1 } }; }
    getProjection() { return {}; }
    getZoom() { return Number(this.host.dataset.zoom); }
    addListener(name, callback) { return listen(this, name, callback); }
    setCenter(position) {
      this.position = typeof position.lat === 'function' ? { lat: position.lat(), lng: position.lng() } : position;
      this.host.dataset.center = JSON.stringify(this.position);
    }
    panTo(position) { this.bounds = null; this.setCenter(position); queueMicrotask(() => trigger(this, 'idle')); }
    setZoom(zoom) { this.host.dataset.zoom = String(zoom); queueMicrotask(() => trigger(this, 'idle')); }
    fitBounds(bounds) {
      bounds = bounds.toJSON ? bounds.toJSON() : bounds;
      this.bounds = bounds;
      this.host.dataset.bounds = JSON.stringify(bounds);
      this.setCenter({ lat: (bounds.north + bounds.south)/2, lng: (bounds.east + bounds.west)/2 });
      queueMicrotask(() => trigger(this, 'idle'));
    }
  }
  class TestMarker {
    constructor(options) {
      this.position = options.position;
      this.slot = markers.size;
      this.node = document.createElement('button');
      this.node.type = 'button';
      this.node.dataset.markerId = String(++markerSerial);
      this.node.setAttribute('aria-label', options.title);
      this.node.dataset.position = JSON.stringify(options.position);
      this.node.style.cssText = 'position:absolute;border:0;background:transparent;left:40%;top:35%';
      this.collisionBehavior = options.collisionBehavior;
      this.zIndex = options.zIndex ?? 0;
      if (options.content) this.node.append(options.content);
      markers.add(this);
      this.map = options.map;
    }
    set collisionBehavior(value) { this.node.dataset.collisionBehavior = String(value); }
    set zIndex(value) { this.node.dataset.priority = String(value); this.node.style.zIndex = String(value); }
    set title(value) { this.node.setAttribute('aria-label', value); }
    set map(map) {
      if (!map) { this.node.remove(); return; }
      map.host.append(this.node);
      const i = this.slot % 6;
      this.node.style.left = (10 + (i % 3)*28) + '%';
      this.node.style.top = (20 + Math.floor(i/3)*25) + '%';
    }
    addListener(name, callback) {
      const domName = name === 'gmp-click' ? 'click' : name;
      this.node.addEventListener(domName, callback);
      return { remove: () => this.node.removeEventListener(domName, callback) };
    }
  }
  const maps = window.google.maps;
  maps.ControlPosition = { RIGHT_CENTER: 'right-center' };
  maps.CollisionBehavior = { REQUIRED_AND_HIDES_OPTIONAL: 'required', REQUIRED: 'always', OPTIONAL_AND_HIDES_LOWER_PRIORITY: 'optional' };
  maps.LatLng = LatLng;
  maps.LatLngBounds = LatLngBounds;
  maps.OverlayView = OverlayView;
  maps.Map = TestMap;
  maps.marker = { AdvancedMarkerElement: TestMarker };
  maps.event = { trigger, addListener: listen, removeListener(listener) { listener.remove(); }, clearInstanceListeners(target) { events.delete(target); } };
  maps.importLibrary = async (name) => name === 'maps' ? { Map: TestMap } : { AdvancedMarkerElement: TestMarker };
  window.__panTestMap = (lat, lng) => currentMap.panTo({ lat, lng });
  window.__zoomTestMap = (zoom) => currentMap.setZoom(zoom);
  window.__boundsTestMap = (bounds) => { currentMap.bounds = bounds; trigger(currentMap, 'idle'); };
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
