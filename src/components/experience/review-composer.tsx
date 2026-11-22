"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/api-client/auth";
import { ApiError } from "@/lib/api-client/client";
import { discoveryClient } from "@/lib/api-client/discovery";
import type { AuthSession } from "@/types/auth";
import { placeCategories, type AppExperience, type PlaceCategory, type PlaceExperiences } from "@/types/discovery";
import type { Coordinates, MapPlace } from "@/types/places";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function ReviewComposer({ target, point, onSaved, onBusy }: {
  target: MapPlace | null; point: Coordinates | null;
  onSaved: (result: PlaceExperiences) => void; onBusy: (busy: boolean) => void;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory | "">("");
  const [rating, setRating] = useState("4");
  const [verdict, setVerdict] = useState<AppExperience["verdict"] | "">("");
  const [step, setStep] = useState<"name" | "date" | "rating" | "review">(target?.app_id ? "date" : "name");
  const [visited, setVisited] = useState(today);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const live = useRef(true);
  const firstField = useRef<HTMLSelectElement>(null);
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
  useEffect(() => { if (session) firstField.current?.focus(); }, [session]);

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
    <p className="eyebrow">YOUR EXPERIENCE</p><h2>{target?.app_id ? target.display_name : "Review a place"}</h2>
    <p className="review-intro">Your rating and review will be public on the map.</p>
    {checking ? <p role="status">Checking sign-in…</p> : !session ? <>
      <p>Sign in to share your experience.</p>
      <button className="primary-button" onClick={() => authClient.startLogin()}>Sign in to review</button>
    </> : <form className="review-form" onSubmit={submit}>
      <fieldset disabled={saving}>
        {target?.app_id ? <p>Add to a list ? {target.category ?? target.app_category ?? "Existing place"}</p> : (
          <label>Add to a list<select ref={firstField} value={category} onChange={(event) => setCategory(event.target.value as PlaceCategory)} required>
            <option value="" disabled>Select a category</option>
            {placeCategories.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
          </select></label>
        )}
        <label>How was it?<select ref={target?.app_id ? firstField : undefined} value={verdict} onChange={(event) => setVerdict(event.target.value as AppExperience["verdict"])} required>
          <option value="" disabled>Select your overall take</option>
          <option value="neutral">It was okay</option><option value="recommend">I recommend it</option><option value="avoid">I would avoid it</option>
        </select></label>

        {(target?.app_id || category) && verdict && <>
          {!target?.app_id && <label>Place name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="What do you call this place?"/></label>}
          {step === "name" && <button className="primary-button" type="button" disabled={!name.trim()} onClick={() => setStep("date")}>Continue</button>}

          {step !== "name" && <label>Date visited<input type="date" required max={today()} value={visited} onChange={(event) => setVisited(event.target.value)}/></label>}
          {step === "date" && <button className="primary-button" type="button" disabled={!visited || visited > today()} onClick={() => setStep("rating")}>Continue</button>}

          {(step === "rating" || step === "review") && <label>Your rating<select value={rating} onChange={(event) => setRating(event.target.value)}>
            {Array.from({ length: 9 }, (_, index) => 1 + index / 2).map((value) => <option key={value} value={value}>{value.toFixed(1)} out of 5</option>)}
          </select></label>}
          {step === "rating" && <button className="primary-button" type="button" onClick={() => setStep("review")}>Continue</button>}

          {step === "review" && <>
            <label>Your review<textarea value={review} onChange={(event) => setReview(event.target.value)} maxLength={2000} rows={4} placeholder="What should someone know before visiting?"/></label>
            <button className="primary-button" disabled={saving || (!target?.app_id && !point)}>{saving ? "Sharing?" : "Share experience"}</button>
          </>}
        </>}
      </fieldset>
    </form>}
    {error && <div role="alert">{error}{!session && <button type="button" onClick={() => { setChecking(true); setError(""); setAuthAttempt((n) => n + 1); }}>Check sign-in again</button>}</div>}
  </>;
}
