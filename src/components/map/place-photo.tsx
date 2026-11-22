/* eslint-disable @next/next/no-img-element -- Google photo URLs must not be cached by the image optimizer. */
"use client";

import { useEffect, useState } from "react";
import { placesClient } from "@/lib/api-client/places";
import type { PlacePhoto as Photo } from "@/types/places";
import { PlaceGlyph } from "./place-marker";

function safeUrl(value?: string | null) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.href : undefined; }
  catch { return undefined; }
}

export function PlacePhoto({ name, googleId, reviewPhoto, active = true }: { name: string; googleId?: string; reviewPhoto?: string; active?: boolean }) {
  return <PhotoContent key={`${googleId ?? name}:${reviewPhoto ?? ""}`} name={name} googleId={googleId} reviewPhoto={reviewPhoto} active={active} />;
}

function PhotoContent({ name, googleId, reviewPhoto, active }: { name: string; googleId?: string; reviewPhoto?: string; active: boolean }) {
  const [reviewFailed, setReviewFailed] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [finished, setFinished] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const shared = safeUrl(reviewPhoto);
  const useGoogle = !shared || reviewFailed;
  useEffect(() => {
    if (!active || !useGoogle || !googleId || finished) return;
    const controller = new AbortController();
    placesClient.photo(googleId, controller.signal).then(({ photo }) => {
      if (!controller.signal.aborted) setPhoto(photo);
    }).catch(() => {
      if (!controller.signal.aborted) setRequestFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted) setFinished(true);
    });
    return () => controller.abort();
  }, [googleId, useGoogle, active, finished]);
  if (shared && !reviewFailed) return <img className="discovery-place-photo" src={shared} alt={`A photo shared from ${name}`} onError={() => setReviewFailed(true)} />;
  if (photo && safeUrl(photo.url) && !imageFailed) return <figure className="discovery-photo-figure">
    <img className="discovery-place-photo" src={safeUrl(photo.url)} alt={`Photo of ${name}`} onError={() => setImageFailed(true)} />
    <figcaption className="discovery-photo-credit">
      <span>Google Maps{photo.authors.length > 0 ? " · " : ""}</span>
      {photo.authors.map((author, index) => <span key={index}>
        {safeUrl(author.photo_uri) && <img src={safeUrl(author.photo_uri)} alt="" width={20} height={20} />}
        {safeUrl(author.uri) ? <a href={safeUrl(author.uri)} target="_blank" rel="noopener noreferrer">{author.display_name}</a> : author.display_name}
        {index < photo.authors.length - 1 ? ", " : ""}
      </span>)}
      {safeUrl(photo.google_maps_uri) && <a href={safeUrl(photo.google_maps_uri)} target="_blank" rel="noopener noreferrer">View original</a>}
      {safeUrl(photo.flag_content_uri) && <a href={safeUrl(photo.flag_content_uri)} target="_blank" rel="noopener noreferrer">Report photo</a>}
    </figcaption>
  </figure>;
  if (requestFailed || imageFailed) return <div className="discovery-place-photo discovery-place-photo-empty">
    <PlaceGlyph category="Place"/><span role="status">Couldn’t load photo</span>
    <button type="button" className="profile-history-button" onClick={() => {
      setRequestFailed(false); setImageFailed(false); setPhoto(null); setFinished(false);
    }}>Retry photo</button>
  </div>;
  const loading = Boolean(googleId && !finished);
  return <div className={`discovery-place-photo discovery-place-photo-empty${loading ? " discovery-photo-loading" : ""}`} role="img" aria-label={loading ? "Loading place photo" : `No photo available for ${name}`}>
    <PlaceGlyph category="Place"/><span>{loading ? "Loading photo…" : "No photo available yet"}</span>
  </div>;
}
