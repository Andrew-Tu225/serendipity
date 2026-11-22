"use client";

import { useEffect, useState } from "react";
import { recommendationsClient } from "@/lib/api-client/recommendations";
import { discoveryClient } from "@/lib/api-client/discovery";
import { mapPlace } from "@/types/discovery";
import { categoryLabels } from "@/types/profile";
import type { MapPlace } from "@/types/places";
import type { Recommendation } from "@/types/recommendations";

const reasons = { friend: "Recommended by people you follow", similar_taste: "Loved by people with similar taste", explore: "Something new to you" };

export function HomeRecommendations({ revision, onSelect, onExplore }: {
  revision: number; onSelect: (place: MapPlace) => void; onExplore: () => void;
}) {
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    recommendationsClient.aroundLondon(controller.signal).then((data) => setItems(data.items)).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [revision, attempt]);
  async function select(item: Recommendation) {
    if (opening) return;
    setOpening(item.place.id); setSelectionError("");
    try { onSelect(mapPlace((await discoveryClient.details(item.place.id)).place)); }
    catch (failure) { setSelectionError(failure instanceof Error ? failure.message : "Could not open this place."); }
    finally { setOpening(null); }
  }
  return <section className="recommendations-view" aria-label="Recommended places">
    <p className="eyebrow">AROUND LONDON, ONTARIO</p>
    <p className="recommendations-intro">A little curiosity. A new favourite place.</p>
    {error ? <div className="taste-panel" role="alert">{error}<button className="text-button" onClick={() => {
      setError(""); setItems(null); setAttempt((n) => n + 1);
    }}>Try again</button></div> : items === null ? <p role="status">Finding places for you…</p> : !items.length ? <div className="taste-panel">
      <h2>Your next discovery is out there</h2><p>No recommendations around London yet. Explore the map and share an Experience to get things started.</p>
    </div> : <div className="recommendation-list">{items.map((item) => <article className="recommendation-card" key={item.place.id}>
      <p className="eyebrow">{categoryLabels[item.place.category]}</p>
      <h2>{item.place.name}</h2><p className="recommendation-reason">{reasons[item.kind]}</p>
      {item.logs.map((log) => <blockquote key={log.experience_id}>
        <p>{log.review || `${log.author.display_name} rated this place ${log.rating}/5.`}</p>
        <footer>{log.author.display_name} · {log.rating}/5 · {log.relation === "following" ? "Following" : log.relation === "similar_taste" ? "Similar taste" : "Community"}</footer>
      </blockquote>)}
      <button className="primary-button" disabled={opening !== null} onClick={() => void select(item)}>
        {opening === item.place.id ? "Opening…" : "View on map"}
      </button>
    </article>)}</div>}
    {selectionError && <p role="alert">{selectionError}</p>}
    <button className="text-button" onClick={onExplore}>Explore the map →</button>
  </section>;
}
