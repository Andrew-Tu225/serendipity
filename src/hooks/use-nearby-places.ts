import { useEffect, useRef, useState } from "react";
import { placesClient } from "@/lib/api-client/places";
import { bufferBounds, containsPoint } from "@/lib/maps/bounds";
import type { MapHandle } from "@/lib/maps/google-map";
import { nearbyCells, nearbyPlace, NearbyRequestBudget, prioritizeNearbyCells } from "@/lib/maps/nearby-places";
import type { MapPlace } from "@/types/places";

const FRESH_MS = 5 * 60_000;
const MAX_CONCURRENT = 3;
// Provider results are transient display state, never persisted or put in app-data cache.
export function useNearbyPlaces(map: MapHandle | null, active: boolean) {
  const cells = useRef(new Map<string, { places: MapPlace[]; fetched: number; version: number }>());
  const version = useRef(0);
  const budget = useRef(new NearbyRequestBudget());
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState({ places: [] as MapPlace[], error: "", zoomIn: false, waiting: false });
  useEffect(() => {
    if (!map || !active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let expiry: ReturnType<typeof setTimeout>;
    let running = false;
    let controller: AbortController | undefined;
    let error = "";
    let blockedUntil = 0;
    const wantedCells = () => nearbyCells(map!.bounds(), map!.zoom());
    function publish() {
      if (disposed) return;
      const now = Date.now(), area = bufferBounds(map!.bounds());
      for (const [key, value] of cells.current) if (now - value.fetched >= 3 * FRESH_MS) cells.current.delete(key);
      const wanted = new Set(wantedCells().map((cell) => cell.key));
      while (cells.current.size > 48) {
        const entries = [...cells.current];
        const removable = entries.find(([key, value]) => !wanted.has(key) && !value.places.some((place) => area.some((rectangle) => containsPoint(rectangle, place.location))))
          ?? entries.find(([key]) => !wanted.has(key)) ?? entries[0];
        cells.current.delete(removable[0]);
      }
      const places = new Map<string, { place: MapPlace; version: number }>();
      for (const value of cells.current.values()) for (const place of value.places) {
        if (area.some((rectangle) => containsPoint(rectangle, place.location)) && (places.get(place.place_id)?.version ?? -1) < value.version) {
          places.set(place.place_id, { place, version: value.version });
        }
      }
      const waiting = wantedCells().some((cell) => !cells.current.has(cell.key)) && budget.current.retryAt(now) > now;
      const snapshot = { error, zoomIn: !wantedCells().length, waiting };
      const rows = [...places.values()].map(({ place }) => place);
      setView((previous) => {
        const previousPlaces = new Map(previous.places.map((place) => [place.place_id, place]));
        const next = rows.map((place) => {
          const old = previousPlaces.get(place.place_id);
          return old && JSON.stringify(old) === JSON.stringify(place) ? old : place;
        });
        return { ...snapshot, places: next.length === previous.places.length && next.every((place, index) => place === previous.places[index]) ? previous.places : next };
      });
    }
    async function refresh() {
      if (disposed || document.hidden) return;
      publish();
      if (running || Date.now() < blockedUntil) return;
      running = true;
      controller = new AbortController();
      const current = controller;
      try {
        const wanted = prioritizeNearbyCells(wantedCells(), map!.center());
        let nextCell = 0;
        let failed = false;
        error = "";
        async function worker() {
          while (!disposed && !current.signal.aborted && !failed && nextCell < wanted.length) {
            const cell = wanted[nextCell++];
            const cached = cells.current.get(cell.key);
            if (cached && Date.now() - cached.fetched < FRESH_MS) continue;
            // Skip queued areas that became obsolete while other searches were running.
            if (!wantedCells().some((next) => next.key === cell.key)) continue;
            if (!budget.current.take(Date.now())) { publish(); return; }
            try {
              const result = await placesClient.nearby(cell.center, cell.radius, current.signal);
              if (disposed || current.signal.aborted) return;
              cells.current.set(cell.key, { places: result.places.map(nearbyPlace), fetched: Date.now(), version: ++version.current });
              publish();
            } catch {
              if (disposed || current.signal.aborted) return;
              failed = true;
              error = "Nearby places couldn’t load. Your app reviews are still available.";
              blockedUntil = Date.now() + 60_000;
              publish();
            }
          }
        }
        await Promise.all(Array.from({ length: MAX_CONCURRENT }, worker));
      } finally {
        running = false;
        if (!disposed) {
          clearTimeout(expiry);
          const now = Date.now();
          const pending = wantedCells().some((cell) => !cells.current.has(cell.key) || now - cells.current.get(cell.key)!.fetched >= FRESH_MS);
          const next = Math.max(blockedUntil, pending ? budget.current.retryAt(now) : now,
            pending ? now : Math.min(...wantedCells().map((cell) => cells.current.get(cell.key)!.fetched + FRESH_MS), now + FRESH_MS));
          expiry = setTimeout(queue, Math.max(1000, next - Date.now()));
          if (!error && pending && budget.current.retryAt(now) <= now) queue();
        }
      }
    }
    function queue() { clearTimeout(timer); timer = setTimeout(() => void refresh(), 500); }
    function visibility() {
      if (document.hidden) { clearTimeout(timer); clearTimeout(expiry); controller?.abort(); }
      else queue();
    }
    const unsubscribe = map.onIdle(queue);
    document.addEventListener("visibilitychange", visibility);
    queue();
    return () => {
      disposed = true; clearTimeout(timer); clearTimeout(expiry); controller?.abort(); unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [map, active, attempt]);
  return { ...view, retry: () => setAttempt((value) => value + 1) };
}
