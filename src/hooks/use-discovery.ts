import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/api-client/auth";
import { ApiError } from "@/lib/api-client/client";
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
  const cache = useRef(new DiscoveryCache());
  const viewer = useRef<string | null | undefined>(undefined);
  const loaded = useRef(false);
  const appliedRevision = useRef(0);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View>({ places: [], loading: true, fetching: false, complete: false, hasVisiblePlaces: false, error: "", viewerKey: "unknown", identityReady: false });

  useEffect(() => {
    if (!map || !active) return;
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout>;
    let expiry: ReturnType<typeof setTimeout>;
    let authRequest: AbortController | undefined;
    let checkingIdentity = false;
    let identityReady = viewer.current !== undefined;
    let error = "";
    let job: { controller: AbortController; bounds: MapBounds[] } | undefined;

    function publish() {
      if (disposed) return;
      const now = Date.now(), visible = map!.bounds();
      const complete = visible.length > 0 && !cache.current.missing(visible, now).length;
      if (complete) loaded.current = true;
      const places = cache.current.read(bufferBounds(visible), now);
      const fetching = Boolean(job) || checkingIdentity;
      const snapshot = {
        loading: !loaded.current && !error, fetching, complete,
        hasVisiblePlaces: cache.current.read(visible, now).length > 0,
        error, viewerKey: viewer.current ?? (identityReady ? "guest" : "unknown"), identityReady,
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
      expiry = setTimeout(() => void verifyIdentity(), Math.max(100, next - now));
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
      if (disposed || !identityReady || checkingIdentity || document.hidden) return;
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

    async function verifyIdentity() {
      if (disposed || document.hidden || checkingIdentity) return;
      checkingIdentity = true;
      const currentAuth = new AbortController();
      authRequest = currentAuth;
      try {
        await Promise.resolve();
        if (disposed || currentAuth.signal.aborted) return;
        if (revision !== appliedRevision.current && reviewedPlace) {
          cache.current.merge([reviewedPlace], Date.now());
          cache.current.invalidateAt(reviewedPlace.location);
          appliedRevision.current = revision;
          publish();
        }
        let next: string | null;
        try {
          next = (await authClient.getSession(currentAuth.signal)).user.id;
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 401) throw failure;
          next = null;
        }
        if (disposed || currentAuth.signal.aborted) return;
        if (viewer.current !== undefined && next !== viewer.current) {
          job?.controller.abort(); job = undefined;
          cache.current.clearPersonalization();
        }
        viewer.current = next;
        identityReady = true;
        error = "";
      } catch (failure) {
        if (disposed || currentAuth.signal.aborted) return;
        job?.controller.abort(); job = undefined;
        cache.current.clearPersonalization();
        identityReady = false;
        viewer.current = undefined;
        error = failure instanceof Error ? failure.message : "Could not verify sign-in.";
      } finally {
        if (!disposed && !currentAuth.signal.aborted) {
          checkingIdentity = false;
          publish();
          if (identityReady) queueRefresh();
          scheduleExpiry();
        }
      }
    }

    function visibility() {
      if (document.hidden) {
        clearTimeout(debounce); clearTimeout(expiry);
        authRequest?.abort(); checkingIdentity = false;
        job?.controller.abort(); job = undefined;
      } else void verifyIdentity();
    }

    const unsubscribe = map.onIdle(queueRefresh);
    window.addEventListener("focus", verifyIdentity);
    document.addEventListener("visibilitychange", visibility);
    void verifyIdentity();
    return () => {
      disposed = true; clearTimeout(debounce); clearTimeout(expiry);
      authRequest?.abort(); job?.controller.abort(); unsubscribe();
      window.removeEventListener("focus", verifyIdentity);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [map, active, revision, reviewedPlace, retry]);

  return { ...view, getPlace: (id: string) => cache.current.get(id), retry: () => setRetry((n) => n + 1) };
}
