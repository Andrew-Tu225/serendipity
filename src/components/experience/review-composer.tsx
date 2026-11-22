"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/api-client/auth";
import { ApiError } from "@/lib/api-client/client";
import { discoveryClient } from "@/lib/api-client/discovery";
import type { AuthSession } from "@/types/auth";
import { placeCategories, type AppExperience, type ExperienceLocation, type PlaceCategory, type PlaceExperiences } from "@/types/discovery";
import { ExperienceLocationField } from "./experience-location-field";
import { localToday } from "./local-date";

export function ReviewComposer({ location, onSelectLocation, onSaved, onBusy }: {
  location: ExperienceLocation | null; onSelectLocation: () => void;
  onSaved: (result: PlaceExperiences) => void; onBusy: (busy: boolean) => void;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [error, setError] = useState("");
  const [placeFields, setPlaceFields] = useState<{ location: ExperienceLocation | null; name: string; category: PlaceCategory | "" }>({ location, name: "", category: "" });
  const name = placeFields.location === location ? placeFields.name : "";
  const category = placeFields.location === location ? placeFields.category : "";
  const target = location?.place;
  const point = location?.point;
  const hasLocation = Boolean(target?.app_id || point);
  const hasCategory = hasLocation && Boolean(target?.app_id || category);
  const hasName = Boolean(target?.app_id || name.trim());
  const [rating, setRating] = useState("4");
  const [verdict, setVerdict] = useState<AppExperience["verdict"] | "">("");
  const [step, setStep] = useState<"name" | "date" | "rating" | "review">("name");
  const stage = target?.app_id && step === "name" ? "date" : step;
  const [visited, setVisited] = useState(localToday);
  const hasVisitDate = Boolean(visited && visited <= localToday());
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    authClient.getSession(controller.signal).then((result) => {
      if (!controller.signal.aborted) setSession(result);
    }).catch((error) => {
      if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) {
        setError(error instanceof Error ? error.message : "Could not check sign-in.");
      }
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [authAttempt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session || pending.current || step !== "review" || !verdict) return;
    const existingPlaceId = target?.app_id;
    const place = existingPlaceId ? { place_id: existingPlaceId } :
      point && category && name.trim() ? {
        new_place: { name: name.trim(), category, ...point, google_place_id: target?.source === "google" ? target.place_id : undefined },
      } : null;
    if (!place) return;
    pending.current = true;
    setSaving(true); onBusy(true); setError("");
    try {
      const result = await discoveryClient.createExperience({
        ...place, rating: Number(rating), verdict, visited_on: visited, review,
      }, session.csrf_token);
      if (live.current) onSaved(result);
    } catch (error) {
      if (!live.current) return;
      if (error instanceof ApiError && error.status === 401) setSession(null);
      setError(error instanceof Error ? error.message : "Could not save your review.");
    } finally {
      pending.current = false;
      if (live.current) { setSaving(false); onBusy(false); }
    }
  }

  return <>
    <h2>Add an experience</h2>
    <p className="review-intro">Your rating and review will be public on the map.</p>
    {checking ? <p role="status">Checking sign-in…</p> : !session ? <>
      <p>Sign in to share your experience.</p>
      <button className="primary-button" onClick={() => authClient.startLogin()}>Sign in to review</button>
    </> : <form className="review-form" onSubmit={submit}>
      <fieldset disabled={saving}>
        <ExperienceLocationField name={target?.display_name} address={target?.address} point={point}
          google={target?.source === "google" || Boolean(target?.address)} onSelect={onSelectLocation}/>
        {target && !hasLocation && <p className="review-intro">Confirm a pin on the map to continue.</p>}
        {hasLocation && !target?.app_id && (
          <label>Add to a list<select value={category} onChange={(event) => setPlaceFields({ location, name, category: event.target.value as PlaceCategory })} required>
            <option value="" disabled>Select a category</option>
            {placeCategories.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
          </select></label>
        )}
        {hasCategory && <label>How was it?<select value={verdict} onChange={(event) => setVerdict(event.target.value as AppExperience["verdict"])} required>
          <option value="" disabled>Select your overall take</option>
          <option value="neutral">It was okay</option><option value="recommend">I recommend it</option><option value="avoid">I would avoid it</option>
        </select></label>}

        {hasCategory && verdict && <>
          {!target?.app_id && <label>Place name<input value={name} onChange={(event) => setPlaceFields({ location, name: event.target.value, category })} required maxLength={120} placeholder="What do you call this place?"/></label>}
          {stage === "name" && <button className="primary-button" type="button" disabled={!name.trim()} onClick={() => setStep("date")}>Continue</button>}

          {stage !== "name" && hasName && <label>Date visited<input type="date" required max={localToday()} value={visited} onChange={(event) => setVisited(event.target.value)}/></label>}
          {stage === "date" && hasName && <button className="primary-button" type="button" disabled={!hasVisitDate} onClick={() => setStep("rating")}>Continue</button>}

          {hasName && hasVisitDate && (stage === "rating" || stage === "review") && <label>Your rating<select value={rating} onChange={(event) => setRating(event.target.value)}>
            {Array.from({ length: 9 }, (_, index) => 1 + index / 2).map((value) => <option key={value} value={value}>{value.toFixed(1)} out of 5</option>)}
          </select></label>}
          {stage === "rating" && hasName && hasVisitDate && <button className="primary-button" type="button" onClick={() => setStep("review")}>Continue</button>}

          {stage === "review" && hasName && hasVisitDate && <>
            <label>Your review<textarea value={review} onChange={(event) => setReview(event.target.value)} maxLength={2000} rows={4} placeholder="What should someone know before visiting?"/></label>
            <button className="primary-button" disabled={saving}>{saving ? "Sharing…" : "Share experience"}</button>
          </>}
        </>}
      </fieldset>
    </form>}
    {error && <div role="alert">{error}{!session && <button type="button" onClick={() => { setChecking(true); setError(""); setAuthAttempt((n) => n + 1); }}>Check sign-in again</button>}</div>}
  </>;
}
