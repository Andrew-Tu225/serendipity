"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createGoogleMap, TORONTO, type MapHandle } from "@/lib/maps/google-map";
import type { Coordinates, MapPlace } from "@/types/places";
import { discoveryClient } from "@/lib/api-client/discovery";
import { ApiError } from "@/lib/api-client/client";
import { useDiscovery } from "@/hooks/use-discovery";
import { mapPlace, type PlaceExperiences } from "@/types/discovery";
import { PlaceGlyph, PlaceMarker } from "./place-marker";
import { PlaceSearch } from "./place-search";

// Provider links and attribution URLs are external, so accept only HTTP(S) destinations.
function externalUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

export default function DiscoverMap({ active, revision, selected, onSelect, onReview, picking, onPick, onCancelPick }: {
  active: boolean; revision: number; selected: MapPlace | null;
  onSelect: (place: MapPlace | null) => void; onReview: (place: MapPlace | null) => void;
  picking: boolean; onPick: (point: Coordinates) => void; onCancelPick: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapHandle | null>(null);
  const alive = useRef(false);
  const locationRequest = useRef(0);
  const [map, setMap] = useState<MapHandle | null>(null);
  const [mapError, setMapError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [searchPlace, setSearchPlace] = useState<MapPlace | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [resolveError, setResolveError] = useState("");
  const resolveRequest = useRef<AbortController | null>(null);
  const discovery = useDiscovery(map, active, revision);

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

  useEffect(() => {
    if (!map || !active || !picking) return;
    return map.onPick(onPick);
  }, [map, active, picking, onPick]);

  useEffect(() => () => { resolveRequest.current?.abort(); }, [active]);

  const getCenter = useCallback(() => mapRef.current?.center() ?? TORONTO, []);
  const selectPlace = useCallback((place: MapPlace) => {
    resolveRequest.current?.abort();
    onSelect(place);
  }, [onSelect]);
  const selectSearch = useCallback((place: MapPlace) => {
    resolveRequest.current?.abort();
    const controller = new AbortController();
    resolveRequest.current = controller;
    setResolveError("");
    setSearchPlace(place);
    onSelect(place);
    mapRef.current?.focus(place);
    discoveryClient.resolve(place.place_id, controller.signal).then((appPlace) => {
      if (controller.signal.aborted) return;
      setSearchPlace(null);
      onSelect(mapPlace(appPlace));
    }).catch((error) => {
      if (controller.signal.aborted || (error instanceof ApiError && error.status === 404)) return;
      setResolveError("App reviews could not be checked for this search result.");
    });
  }, [onSelect]);

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
        {discovery.places.filter((place) => !searchPlace || place.google_place_id !== searchPlace.place_id).map((place) => <PlaceMarker key={place.place_id} map={map} place={place} selected={selected?.place_id === place.place_id} onSelect={selectPlace}/>)}
        {searchPlace && <PlaceMarker key={searchPlace.place_id} map={map} place={searchPlace} selected={selected?.place_id === searchPlace.place_id} onSelect={selectPlace}/>}
        {selected?.source === "app" && !discovery.places.some((place) => place.place_id === selected.place_id) && <PlaceMarker map={map} place={selected} selected onSelect={selectPlace}/>}
        <div className="discovery-demo-key">Serendipity ratings · Friends highlighted</div>
        {picking ? <div className="discovery-data-status" role="status">Tap the map to place your pin, or review an existing place.
          <button onClick={() => onPick(map.center())}>Use map center</button><button onClick={onCancelPick}>Cancel</button>
        </div> : <>
          {discovery.loading && <div className="discovery-data-status" role="status">Loading app-reviewed places…</div>}
          {discovery.error && <div className="discovery-data-status" role="alert">{discovery.error} <button onClick={discovery.retry}>Reload places</button></div>}
          {!discovery.loading && !discovery.error && !discovery.places.length && <div className="discovery-data-status" role="status">No app reviews in this area yet. <button onClick={() => onReview(null)}>Review a place</button></div>}
        </>}
        <button type="button" className="discovery-locate" aria-label="Center on my location" aria-busy={active && locating}
          onClick={locate}><span aria-hidden="true">◎</span></button>
      </>}
      {selected && !picking && <article className="discovery-preview" aria-label="Selected place">
        <div className="discovery-place-art" aria-hidden="true"><PlaceGlyph category={selected.category}/></div>
        <div className="discovery-preview-copy"><span>{selected.source === "app" ? `${selected.app_category} · Serendipity` : "Place"}</span>
          <h2>{selected.display_name}</h2><p>{selected.address}</p>
          {selected.rating_summary && <p className="discovery-rating-summary">
            <strong>★ {selected.rating_summary.average.toFixed(1)}/5</strong> · {selected.rating_summary.count} reviewers · Serendipity
          </p>}
          {selected.friend && <p className="discovery-friend-note">{selected.friend.name} {selected.friend.note}{(selected.friend_count ?? 0) > 1 ? ` · ${selected.friend_count} friends reviewed` : ""}</p>}
          {selected.app_id && active && <PlaceReviews key={`${selected.app_id}-${revision}`} placeId={selected.app_id}/>}
          {resolveError && selected.source === "google" && <p role="alert">{resolveError}</p>}
          <button className="discovery-review-button" onClick={() => onReview(selected)}>Write a review</button>
          <a href={externalUrl(selected.google_maps_uri)} target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
          {selected.attributions.map((attribution, index) => <small key={`${attribution.provider}-${index}`}>
            {externalUrl(attribution.provider_uri) ? <a href={externalUrl(attribution.provider_uri)} target="_blank" rel="noopener noreferrer">{attribution.provider}</a> : attribution.provider}
          </small>)}
        </div>
        <button type="button" className="discovery-preview-close" aria-label="Close place preview" onClick={() => { resolveRequest.current?.abort(); onSelect(null); }}>×</button>
      </article>}
      {locationError && <p className="discovery-location-error" role="alert">{locationError}</p>}
    </div>
  </section>;
}

function PlaceReviews({ placeId }: { placeId: string }) {
  const [data, setData] = useState<PlaceExperiences | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    discoveryClient.details(placeId, 0, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((error) => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load reviews.");
    });
    return () => { controller.abort(); request.current?.abort(); };
  }, [placeId, attempt]);
  async function more() {
    if (!data || data.next_offset === null || loading) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const result = await discoveryClient.details(placeId, data.next_offset, controller.signal);
      if (!controller.signal.aborted) setData({ ...result, experiences: [...data.experiences, ...result.experiences] });
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load reviews.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <div className="discovery-reviews">
    {!data && !error && <p role="status">Loading reviews…</p>}
    {data?.experiences.map((review) => <div className="discovery-review" key={review.id}>
      <strong>{review.author_name}{review.is_self ? " · You" : review.is_friend ? " · Friend" : ""} · {review.rating}/5</strong>
      <p>{review.review || (review.verdict === "recommend" ? "Recommends this place" : review.verdict === "avoid" ? "Would avoid this place" : "Visited this place")}</p>
      <small>Visited {review.visited_on}</small>
    </div>)}
    {data?.next_offset !== null && data && <button disabled={loading} onClick={more}>{loading ? "Loading…" : "More reviews"}</button>}
    {error && <p role="alert">{error} <button onClick={() => { setError(""); if (data) void more(); else setAttempt((n) => n + 1); }}>Retry reviews</button></p>}
  </div>;
}
