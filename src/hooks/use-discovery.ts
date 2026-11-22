import { useEffect, useState } from "react";
import { discoveryClient } from "@/lib/api-client/discovery";
import type { MapHandle } from "@/lib/maps/google-map";
import { mapPlace, type DiscoveryPlace } from "@/types/discovery";
import type { MapPlace } from "@/types/places";

export function useDiscovery(map: MapHandle | null, active: boolean, revision: number) {
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!map || !active) return;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    let disposed = false;
    const refresh = () => {
      clearTimeout(timer);
      request?.abort();
      const rectangles = map.bounds();
      if (!rectangles.length) return;
      const controller = new AbortController();
      request = controller;
      timer = setTimeout(async () => {
        setLoading(true);
        setError("");
        try {
          const results = new Map<string, DiscoveryPlace>();
          for (const bounds of rectangles) {
            let cursor: string | null = null;
            do {
              const page = await discoveryClient.places(bounds, cursor, controller.signal);
              if (controller.signal.aborted || disposed) return;
              page.places.forEach((place) => results.set(place.id, place));
              cursor = page.next_cursor;
            } while (cursor);
          }
          setPlaces([...results.values()].map(mapPlace));
        } catch (error) {
          if (controller.signal.aborted || disposed) return;
          setError(error instanceof Error ? error.message : "Could not load app reviews.");
        } finally {
          if (!controller.signal.aborted && !disposed) setLoading(false);
        }
      }, 250);
    };
    const unsubscribe = map.onIdle(refresh);
    refresh();
    return () => { disposed = true; clearTimeout(timer); request?.abort(); unsubscribe(); };
  }, [map, active, revision, retry]);
  return { places, loading, error, retry: () => setRetry((n) => n + 1) };
}
