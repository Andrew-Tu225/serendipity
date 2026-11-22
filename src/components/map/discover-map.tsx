"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGoogleMap, TORONTO, type MapHandle } from "@/lib/maps/google-map";
import type { MapPlace } from "@/types/places";
import { demoPlaces } from "./demo-places";
import { PlaceGlyph, PlaceMarker } from "./place-marker";
import { PlaceSearch } from "./place-search";

// Provider links and attribution URLs are external, so accept only HTTP(S) destinations.
function externalUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

export default function DiscoverMap({ active }: { active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const alive = useRef(false);
  const locationRequest = useRef(0);
  const [map, setMap] = useState<MapHandle | null>(null);
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [searchPlace, setSearchPlace] = useState<MapPlace | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let loaded: MapHandle | null = null;
    const element = host.current!;
    createGoogleMap(element, controller.signal, () => {
      if (!cancelled) {
        setMap(null);
        setMapError("Google Maps authorization failed. Please check the map configuration.");
      }
    }).then((handle) => {
      loaded = handle;
      if (cancelled) { handle.destroy(); return; }
      mapRef.current = handle;
      setMap(handle);
      setMapError("");
    }).catch((error) => {
      if (!cancelled) setMapError(error instanceof Error ? error.message : "Could not load the map.");
    });
    return () => { cancelled = true; controller.abort(); loaded?.destroy(); mapRef.current = null; };
  }, [attempt]);

  useEffect(() => {
    alive.current = active;
    if (active && map) map.resize();
    return () => { alive.current = false; };
  }, [active, map]);

  const getCenter = useCallback(() => mapRef.current?.center() ?? TORONTO, []);
  const selectDemo = useCallback((place: MapPlace) => setSelected(place), []);
  const selectSearch = useCallback((place: MapPlace) => {
    setSearchPlace(place);
    setSelected(place);
    mapRef.current?.focus(place);
  }, []);

  function locate() {
    if (!navigator.geolocation) { setLocationError("Location is not available in this browser."); return; }
    setLocating(true);
    setLocationError("");
    const current = ++locationRequest.current;
    navigator.geolocation.getCurrentPosition((position) => {
      if (current !== locationRequest.current) return;
      setLocating(false);
      if (!alive.current) return;
      mapRef.current?.locate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    }, () => {
      if (current !== locationRequest.current) return;
      setLocating(false);
      if (!alive.current) return;
      setLocationError("We couldn’t get your location. You can still search anywhere.");
    }, { timeout: 10000, maximumAge: 60000 });
  }

  return <section className="discovery-view" aria-label="Discover places">
    <div className="discovery-canvas">
      <div ref={host} className="discovery-map" aria-label="Interactive discovery map"/>
      <PlaceSearch active={active} getCenter={getCenter} onSelect={selectSearch}/>
      {!map && !mapError && <div className="discovery-map-message" role="status">Finding your next favorite corner…</div>}
      {mapError && <div className="discovery-map-message" role="alert"><strong>The map couldn’t load</strong><p>{mapError}</p><button type="button" onClick={() => { setMap(null); setMapError(""); setAttempt((n) => n + 1); }}>Try again</button></div>}
      {map && <>
        {demoPlaces.map((place) => <PlaceMarker key={place.place_id} map={map} place={place} selected={selected?.place_id === place.place_id} onSelect={selectDemo}/>)}
        {searchPlace && <PlaceMarker key={searchPlace.place_id} map={map} place={searchPlace} selected={selected?.place_id === searchPlace.place_id} onSelect={selectDemo}/>}
        <div className="discovery-demo-key">Toronto · Demo ratings & friends</div>
        <button type="button" className="discovery-locate" aria-label="Center on my location" aria-busy={active && locating}
          onClick={locate}><span aria-hidden="true">◎</span></button>
      </>}
      {selected && <article className="discovery-preview" aria-label="Selected place">
        <div className="discovery-place-art" aria-hidden="true"><PlaceGlyph category={selected.category}/></div>
        <div className="discovery-preview-copy"><span>{selected.source === "demo" ? `${selected.category} · Demo` : "Place"}</span>
          <h2>{selected.display_name}</h2><p>{selected.address}</p>
          {selected.rating_summary && <p className="discovery-rating-summary">
            <strong>★ {selected.rating_summary.average.toFixed(1)}/5</strong> · {selected.rating_summary.count} reviews · Serendipity demo
          </p>}
          {selected.friend && <p className="discovery-friend-note">{selected.friend.name} {selected.friend.note} · Demo</p>}
          {selected.friend && <p className="discovery-friend-review">“{selected.friend.review}”</p>}
          <a href={externalUrl(selected.google_maps_uri)} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
          {selected.attributions.map((attribution, index) => <small key={`${attribution.provider}-${index}`}>
            {externalUrl(attribution.provider_uri) ? <a href={externalUrl(attribution.provider_uri)} target="_blank" rel="noopener noreferrer">{attribution.provider}</a> : attribution.provider}
          </small>)}
        </div>
        <button type="button" className="discovery-preview-close" aria-label="Close place preview" onClick={() => setSelected(null)}>×</button>
      </article>}
      {locationError && <p className="discovery-location-error" role="alert">{locationError}</p>}
    </div>
  </section>;
}
