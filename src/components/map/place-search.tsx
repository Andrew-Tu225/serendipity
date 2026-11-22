import { useEffect, useId, useRef, useState } from "react";
import { placesClient } from "@/lib/api-client";
import type { Coordinates, MapPlace, PlaceSuggestion } from "@/types/places";

export function PlaceSearch({ active, getCenter, onSelect }: {
  active: boolean; getCenter: () => Coordinates; onSelect: (place: MapPlace) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);
  const [phase, setPhase] = useState<"idle" | "loading" | "empty" | "details">("idle");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const token = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const showDropdown = open && (suggestions.length > 0 || phase === "empty" || phase === "loading");

  useEffect(() => {
    if (!active || !open || query.trim().length < 2) return;
    const controller = new AbortController();
    const current = ++sequence.current;
    request.current = controller;
    const timer = window.setTimeout(async () => {
      setPhase("loading");
      setError("");
      token.current ??= crypto.randomUUID();
      try {
        const result = await placesClient.autocomplete(query.trim(), token.current, getCenter(), controller.signal);
        if (controller.signal.aborted || current !== sequence.current) return;
        setSuggestions(result.suggestions);
        setIndex(-1);
        setPhase(result.suggestions.length ? "idle" : "empty");
      } catch (error) {
        if (controller.signal.aborted || current !== sequence.current) return;
        setPhase("idle");
        setError(error instanceof Error ? error.message : "Search is unavailable. Please try again.");
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, active, open, attempt, getCenter]);

  // Also cancel a details request when leaving Discover or unmounting.
  useEffect(() => () => {
    request.current?.abort();
    sequence.current++;
    token.current = null;
    setPhase("idle");
  }, [active]);

  function changeQuery(value: string) {
    request.current?.abort();
    sequence.current++;
    setQuery(value);
    setSuggestions([]);
    setIndex(-1);
    setError("");
    setPhase("idle");
    setOpen(value.trim().length >= 2);
    if (!value.trim()) token.current = null;
  }

  async function select(suggestion: PlaceSuggestion) {
    request.current?.abort();
    const controller = new AbortController();
    const current = ++sequence.current;
    request.current = controller;
    const sessionToken = token.current ?? crypto.randomUUID();
    token.current = null;
    setOpen(false);
    setSuggestions([]);
    setQuery(suggestion.primary_text);
    setPhase("details");
    setError("");
    try {
      const place = await placesClient.details(suggestion.place_id, sessionToken, controller.signal);
      if (controller.signal.aborted || current !== sequence.current) return;
      onSelect({ ...place, source: "google" });
      setPhase("idle");
    } catch (error) {
      if (controller.signal.aborted || current !== sequence.current) return;
      setPhase("idle");
      setError(error instanceof Error ? error.message : "Could not open this place.");
    }
  }

  return <div className="discovery-search" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
      setPhase((current) => current === "loading" ? "idle" : current);
    }
  }}>
    <div className="discovery-search-field">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
      <input ref={input} role="combobox" aria-label="Search places" placeholder="Search places"
        aria-autocomplete="list" aria-expanded={showDropdown} aria-controls={listId}
        aria-activedescendant={showDropdown && suggestions[index] ? `${listId}-${index}` : undefined}
        value={query} maxLength={200} autoComplete="off"
        onChange={(event) => changeQuery(event.target.value)}
        onFocus={() => { if (query.trim().length >= 2) setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            request.current?.abort(); sequence.current++; setOpen(false); setPhase("idle");
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (!suggestions.length) return;
            setIndex((current) => event.key === "ArrowDown" ? Math.min(current + 1, suggestions.length - 1) : Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && suggestions.length) {
            event.preventDefault(); void select(suggestions[Math.max(index, 0)]);
          }
        }}/>
      {query && <button type="button" aria-label="Clear search" onClick={() => { changeQuery(""); requestAnimationFrame(() => input.current?.focus()); }}>×</button>}
    </div>
    {showDropdown && <div className="discovery-suggestions">
      <ul id={listId} role="listbox" aria-label="Place suggestions">
        {suggestions.map((suggestion, itemIndex) => <li key={suggestion.place_id} id={`${listId}-${itemIndex}`}
          role="option" aria-selected={index === itemIndex}
          onMouseDown={(event) => event.preventDefault()} onClick={() => void select(suggestion)}>
          <strong>{suggestion.primary_text}</strong><span>{suggestion.secondary_text}</span>
        </li>)}
      </ul>
      {phase === "empty" && <p role="status">No places found. Try another name.</p>}
      <span className="discovery-search-credit">Google Maps</span>
    </div>}
    {(phase === "loading" || phase === "details") && <p className="discovery-search-status" role="status">{phase === "details" ? "Opening place…" : "Searching…"}</p>}
    {error && <div className="discovery-search-status" role="alert">{error} <button type="button" onClick={() => { setOpen(true); setAttempt((n) => n + 1); }}>Try again</button></div>}
  </div>;
}
