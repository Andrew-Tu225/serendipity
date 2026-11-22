import { useEffect, useState } from "react";
import { placesClient } from "@/lib/api-client/places";
import { nearbyPlace } from "@/lib/maps/nearby-places";
import { NearbyDiscovery, type NearbyView } from "@/lib/maps/nearby-discovery";
import type { MapHandle } from "@/lib/maps/google-map";

export function useNearbyPlaces(map: MapHandle | null, active: boolean) {
  const [view, setView] = useState<NearbyView>({ places: [], error: "", zoomIn: false, waiting: false, loading: true, complete: false });
  const [loader] = useState(() => new NearbyDiscovery(async (cell, signal) => {
    const result = await placesClient.nearby(cell.center, cell.radius, signal);
    return result.places.map(nearbyPlace);
  }, setView));

  useEffect(() => {
    if (!map || !active) return;
    const update = () => {
      if (document.hidden) loader.pause();
      else loader.update({ bounds: map.bounds(), center: map.center(), zoom: map.zoom() });
    };
    const unsubscribe = map.onIdle(update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => { loader.pause(); unsubscribe(); document.removeEventListener("visibilitychange", update); };
  }, [map, active, loader]);

  return { ...view, retry: () => loader.retry() };
}
