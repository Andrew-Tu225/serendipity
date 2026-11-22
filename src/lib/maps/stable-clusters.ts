import { SuperClusterAlgorithm, type Cluster } from "@googlemaps/markerclusterer";

type Marker = google.maps.marker.AdvancedMarkerElement;
interface Group { marker: Marker; cluster: Cluster; listener: google.maps.MapsEventListener }

/** Keep unchanged SDK attachments instead of repainting every group after any data update. */
export class StableClusters {
  private algorithm = new SuperClusterAlgorithm({});
  private members = new Set<Marker>();
  private ids = new WeakMap<Marker, number>();
  private serial = 0;
  private groups = new Map<string, Group>();

  constructor(private map: google.maps.Map, private makeGroup: (cluster: Cluster) => Marker) {}

  addMarker(marker: Marker) {
    if (!this.ids.has(marker)) this.ids.set(marker, ++this.serial);
    this.members.add(marker);
  }

  // Selection transfers attachment ownership to the caller until the marker rejoins.
  removeMarker(marker: Marker, keepVisible = false) {
    this.members.delete(marker);
    if (!keepVisible && marker.map != null) marker.map = null;
  }

  render() {
    if (!this.map.getProjection()) return;
    const result = this.algorithm.calculate({ map: this.map, markers: [...this.members],
      // SuperClusterAlgorithm uses only geographic positions and zoom, not overlay projection.
      mapCanvasProjection: {} as google.maps.MapCanvasProjection });
    if (result.changed === false) return;
    const singles = new Set<Marker>(), nextGroups = new Map<string, Group>();
    for (const cluster of result.clusters) {
      const members = cluster.markers as Marker[];
      if (members.length === 1) { singles.add(members[0]); continue; }
      const key = members.map((marker) => this.ids.get(marker)!).sort((a, b) => a - b).join(",");
      let group = this.groups.get(key);
      if (!group) {
        const marker = this.makeGroup(cluster);
        const click = () => {
          const bounds = current.cluster.bounds;
          if (bounds) this.map.fitBounds(bounds);
        };
        const current: Group = { marker, cluster, listener: { remove: () => marker.removeEventListener("gmp-click", click) } };
        marker.addEventListener("gmp-click", click);
        group = current;
      }
      group.cluster = cluster;
      nextGroups.set(key, group);
    }
    // Attach replacement groups first; untouched groups and single pins get no SDK writes.
    for (const group of nextGroups.values()) if (group.marker.map !== this.map) group.marker.map = this.map;
    for (const marker of this.members) {
      const target = singles.has(marker) ? this.map : null;
      if ((marker.map ?? null) !== target) marker.map = target;
    }
    for (const [key, group] of this.groups) if (!nextGroups.has(key)) {
      group.listener.remove();
      if (group.marker.map != null) group.marker.map = null;
    }
    this.groups = nextGroups;
  }

  destroy() {
    for (const marker of this.members) if (marker.map != null) marker.map = null;
    for (const group of this.groups.values()) {
      group.listener.remove();
      if (group.marker.map != null) group.marker.map = null;
    }
    this.members.clear(); this.groups.clear();
  }
}
