import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { recommendationsClient } from "@/lib/api-client/recommendations";
import { containsPoint } from "@/lib/maps/bounds";
import { recommendationPlace } from "@/lib/maps/recommendations";
import type { MapHandle } from "@/lib/maps/google-map";
import type { MapBounds } from "@/types/discovery";
import type { MapPlace } from "@/types/places";

const FRESH_MS = 60_000;
const MAX_VIEWS = 8;
function viewportKey(bounds: MapBounds[]) {
  // Ignore binary floating-point noise when returning to the same camera bounds.
  return bounds.map((area) => [area.west, area.south, area.east, area.north].map((n) => n.toFixed(7)).join(",")).join(";");
}
interface Snapshot { places: MapPlace[]; fetchedAt: number }
interface View { places: MapPlace[]; loading: boolean; fetching: boolean; complete: boolean; error: string }

/** Ranked, limited responses belong to an exact viewport, never to coverage strips. */
export function useRecommendations(map: MapHandle | null, active: boolean, revision: number) {
  const { session } = useSession();
  const viewerKey = session?.user.id ?? "";
  const cache = useRef(new Map<string, Snapshot>());
  const snapshot = useRef<MapPlace[]>([]);
  const loaded = useRef(false);
  const appliedRevision = useRef(revision);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View>({ places: [], loading: true, fetching: false, complete: false, error: "" });

  useEffect(() => {
    if (!map || !active || !viewerKey) return;
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout>;
    let expiry: ReturnType<typeof setTimeout>;
    let job: { key: string; controller: AbortController } | undefined;
    if (appliedRevision.current !== revision) {
      cache.current.clear();
      appliedRevision.current = revision;
    }

    function publish(fetching: boolean, complete: boolean, error = "") {
      if (disposed) return;
      const areas = map!.bounds();
      const places = snapshot.current.filter((place) => areas.some((area) => containsPoint(area, place.location)));
      setView((previous) => ({
        places: previous.places.length === places.length && places.every((place, i) => place === previous.places[i]) ? previous.places : places,
        loading: !loaded.current && !error, fetching, complete, error,
      }));
    }

    function scheduleExpiry(delay: number) {
      clearTimeout(expiry);
      if (!disposed && !document.hidden) expiry = setTimeout(() => void refresh(), Math.max(100, delay));
    }

    async function refresh() {
      if (disposed || document.hidden) return;
      const bounds = map!.bounds();
      if (!bounds.length) return;
      const key = `${viewerKey}:${viewportKey(bounds)}`;
      const cached = cache.current.get(key);
      if (cached && Date.now() - cached.fetchedAt < FRESH_MS) {
        if (job?.key !== key) { job?.controller.abort(); job = undefined; }
        snapshot.current = cached.places;
        loaded.current = true;
        publish(false, true);
        scheduleExpiry(FRESH_MS - (Date.now() - cached.fetchedAt));
        return;
      }
      if (job?.key === key) return;
      job?.controller.abort();
      const current = { key, controller: new AbortController() };
      job = current;
      publish(true, false);
      try {
        const pages = await Promise.all(bounds.map((area) => recommendationsClient.inBounds(area, current.controller.signal)));
        if (disposed || current.controller.signal.aborted || job !== current) return;
        const previous = new Map(snapshot.current.map((place) => [place.place_id, place]));
        const unique = new Map<string, MapPlace>();
        for (const item of pages.flatMap((page) => page.items)) {
          const place = recommendationPlace(item);
          const old = previous.get(place.place_id);
          unique.set(place.place_id, old && JSON.stringify(old) === JSON.stringify(place) ? old : place);
        }
        snapshot.current = [...unique.values()];
        cache.current.delete(key);
        cache.current.set(key, { places: snapshot.current, fetchedAt: Date.now() });
        while (cache.current.size > MAX_VIEWS) cache.current.delete(cache.current.keys().next().value!);
        loaded.current = true;
        job = undefined;
        publish(false, true);
        scheduleExpiry(FRESH_MS);
      } catch (error) {
        if (disposed || current.controller.signal.aborted || job !== current) return;
        job = undefined;
        publish(false, false, error instanceof Error ? error.message : "Could not load recommendations.");
        scheduleExpiry(FRESH_MS);
      }
    }
    function queueRefresh() {
      clearTimeout(debounce);
      // Cancel obsolete ranking immediately, even during the viewport debounce.
      const key = `${viewerKey}:${viewportKey(map!.bounds())}`;
      if (job && job.key !== key) { job.controller.abort(); job = undefined; }
      debounce = setTimeout(() => void refresh(), 250);
    }
    function focus() {
      cache.current.clear();
      if (!document.hidden) queueRefresh();
    }
    function visibility() {
      if (document.hidden) {
        clearTimeout(debounce); clearTimeout(expiry);
        job?.controller.abort(); job = undefined;
      } else focus();
    }
    const unsubscribe = map.onIdle(queueRefresh);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    queueMicrotask(() => { if (!disposed) void refresh(); });
    return () => {
      disposed = true;
      clearTimeout(debounce); clearTimeout(expiry); job?.controller.abort(); unsubscribe();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [map, active, revision, retry, viewerKey]);

  return { ...view, viewerKey, identityReady: Boolean(viewerKey), hasVisiblePlaces: view.places.length > 0,
    getPlace: (id: string) => view.places.find((place) => place.place_id === id),
    retry: () => { cache.current.clear(); setRetry((n) => n + 1); } };
}
