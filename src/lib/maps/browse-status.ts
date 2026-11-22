interface LayerStatus { complete: boolean; error: string }
interface NearbyStatus extends LayerStatus { waiting: boolean; zoomIn: boolean }

/** Recommendation ranking is decoration, never a prerequisite for browsing readiness. */
export function mapBrowseStatus(reviewed: LayerStatus, nearby: NearbyStatus, visiblePlaces: number) {
  if (nearby.zoomIn) return "zoom-in";
  if (nearby.waiting) return "waiting";
  if (visiblePlaces || reviewed.error || nearby.error) return "ready";
  if (!reviewed.complete || !nearby.complete) return "loading";
  return "empty";
}
