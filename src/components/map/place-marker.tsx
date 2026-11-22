import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapHandle } from "@/lib/maps/google-map";
import type { MapPlace } from "@/types/places";

export function PlaceGlyph({ category }: { category?: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {category === "Food" ? <><path d="M5 3v7M9 3v7M5 7h4M7 10v11M18 3c-4 3-4 9 0 9V3Zm0 9v9"/></>
      : category === "Outdoors" ? <><path d="m12 3 7 10h-4l5 6H4l5-6H5L12 3ZM12 19v3"/></>
      : category === "Culture" ? <><path d="m3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18"/></>
      : <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></>}
  </svg>;
}

export function PlaceMarker({ map, place, selected, onSelect }: {
  map: MapHandle; place: MapPlace; selected: boolean; onSelect: (place: MapPlace) => void;
}) {
  const [element] = useState(() => {
    const node = document.createElement("div");
    node.className = "discovery-pin";
    return node;
  });
  const marker = useRef<ReturnType<MapHandle["marker"]> | null>(null);
  useEffect(() => {
    marker.current = map.marker(place.location, element, `View ${place.display_name}`, () => onSelect(place), place.source === "app");
    return () => { marker.current?.remove(); marker.current = null; };
  }, [map, place, element, onSelect]);
  useEffect(() => { marker.current?.select(selected); }, [selected, map, place, element, onSelect]);
  return createPortal(<>
    {place.friend ? <span className="discovery-friend-avatar" aria-label={`${place.friend.name} reviewed this place`}>{place.friend.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span> : <span className="discovery-pin-icon"><PlaceGlyph category={place.category}/></span>}
    <span className="discovery-pin-label">{place.friend ? place.friend.name : place.display_name}</span>
    {place.rating_summary && <span className="discovery-pin-rating" aria-label={`Serendipity rating: ${place.rating_summary.average} out of 5`}>
      ★ {place.rating_summary.average.toFixed(1)} · {place.rating_summary.count}
    </span>}
  </>, element);
}
