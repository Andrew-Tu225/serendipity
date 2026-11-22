import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { discoveryClient } from "@/lib/api-client/discovery";
import { bufferBounds, intersects } from "@/lib/maps/bounds";
import { DiscoveryCache, DISCOVERY_FRESH_MS } from "@/lib/maps/discovery-cache";
import type { MapHandle } from "@/lib/maps/google-map";
import { mapPlace, type MapBounds } from "@/types/discovery";
import type { MapPlace } from "@/types/places";

interface View {
  places: MapPlace[]; loading: boolean; fetching: boolean; complete: boolean;
  hasVisiblePlaces: boolean; error: string; viewerKey: string; identityReady: boolean;
}

export function useDiscovery(map: MapHandle | null, active: boolean, revision: number, reviewedPlace: MapPlace | null) {
  const { session } = useSession();
  const viewerKey = session?.user.id ?? "guest";
  const identityReady = Boolean(session);
  const cache = useRef(new DiscoveryCache());
  const viewer = useRef(viewerKey);
  const loaded = useRef(false);
  const appliedRevision = useRef(0);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View>({ places: [], loading: true, fetching: false, complete: false, hasVisiblePlaces: false, error: "", viewerKey: "unknown", identityReady: false });

  useEffect(() => {
    if (!map || !active) return;
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout>;
    let expiry: ReturnType<typeof setTimeout>;
    let error = "";
    let job: { controller: AbortController; bounds: MapBounds[] } | undefined;

    function publish() {
      if (disposed) return;
      const now = Date.now(), visible = map!.bounds();
      const complete = visible.length > 0 && !cache.current.missing(visible, now).length;
      if (complete) loaded.current = true;
      const places = cache.current.read(bufferBounds(visible), now);
      const fetching = Boolean(job);
      const snapshot = {
        loading: !loaded.current && !error, fetching, complete,
        hasVisiblePlaces: cache.current.read(visible, now).length > 0,
        error, viewerKey, identityReady,
      };
      setView((previous) => ({
        ...snapshot,
        places: places.length === previous.places.length && places.every((place, index) => place === previous.places[index]) ? previous.places : places,
      }));
    }

    function scheduleExpiry() {
      clearTimeout(expiry);
      if (disposed || document.hidden) return;
      const now = Date.now();
      const next = error ? now + DISCOVERY_FRESH_MS : cache.current.nextExpiry(map!.bounds(), now);
      expiry = setTimeout(refresh, Math.max(100, next - now));
    }

    async function load(bounds: MapBounds[]) {
      const current = { controller: new AbortController(), bounds };
      job = current;
      error = "";
      publish();
      try {
        for (const rectangle of bounds) {
          const startedVersion = cache.current.version;
          const seen = new Set<string>();
          let cursor: string | null = null;
          do {
            const page = await discoveryClient.places(rectangle, cursor, current.controller.signal);
            if (disposed || current.controller.signal.aborted || job !== current) return;
            const places = page.places.map(mapPlace);
            places.forEach((place) => seen.add(place.place_id));
            cache.current.merge(places, Date.now());
            publish();
            cursor = page.next_cursor;
          } while (cursor);
          cache.current.complete(rectangle, seen, startedVersion, Date.now());
          cache.current.prune(bufferBounds(map!.bounds()));
          publish();
        }
      } catch (failure) {
        if (disposed || current.controller.signal.aborted || job !== current) return;
        error = failure instanceof Error ? failure.message : "Could not load app reviews.";
      } finally {
        if (!disposed && job === current) {
          job = undefined;
          publish();
          scheduleExpiry();
          if (!error) queueRefresh();
        }
      }
    }

    function refresh() {
      if (disposed || !identityReady || document.hidden) return;
      const visible = map!.bounds();
      if (!visible.length) return;
      const now = Date.now();
      cache.current.touch(visible, now);
      cache.current.prune(bufferBounds(visible));
      if (!cache.current.missing(visible, now).length) {
        if (job && !job.bounds.some((rectangle) => bufferBounds(visible).some((area) => intersects(area, rectangle)))) {
          job.controller.abort(); job = undefined;
        }
        publish(); scheduleExpiry(); return;
      }
      if (job && !cache.current.missing(visible, now, job.bounds).length) { publish(); return; }
      job?.controller.abort();
      void load(cache.current.missing(bufferBounds(visible), now));
    }

    function queueRefresh() {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 250);
    }

    function sync() {
      if (disposed || document.hidden) return;
      if (viewer.current !== viewerKey) {
        cache.current.clearPersonalization();
        viewer.current = viewerKey;
      }
      if (revision !== appliedRevision.current && reviewedPlace) {
        cache.current.merge([reviewedPlace], Date.now());
        cache.current.invalidateAt(reviewedPlace.location);
        appliedRevision.current = revision;
        publish();
      }
      queueRefresh();
    }

    function visibility() {
      if (document.hidden) {
        clearTimeout(debounce); clearTimeout(expiry);
        job?.controller.abort(); job = undefined;
      } else sync();
    }

    const unsubscribe = map.onIdle(queueRefresh);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", visibility);
    queueMicrotask(sync);
    return () => {
      disposed = true; clearTimeout(debounce); clearTimeout(expiry);
      job?.controller.abort(); unsubscribe();
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [map, active, revision, reviewedPlace, retry, viewerKey, identityReady]);

  return { ...view, getPlace: (id: string) => cache.current.get(id), retry: () => setRetry((n) => n + 1) };
}
