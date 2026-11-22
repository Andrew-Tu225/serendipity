import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { CharacterPortrait } from "@/components/profile/character-portrait";
import { Icon } from "@/components/ui/icon";
import type { BuddySuggestion } from "@/types/buddies";
import { categoryLabels } from "@/types/profile";
import { describeBuddyInterests } from "./buddy-interests";
import { demoBuddyImages } from "./demo-buddies";

const swipeThreshold = 65;

export function BuddyDeckCard({ buddy, demo, busy, onSkip, onMessage }: {
  buddy: BuddySuggestion;
  demo: boolean;
  busy: boolean;
  onSkip: () => void;
  onMessage: () => void;
}) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const [distance, setDistance] = useState(0);
  const photo = demo ? demoBuddyImages[buddy.id] : undefined;
  const interests = buddy.interests ?? (buddy.liked_categories ?? []).map((category) => categoryLabels[category]);

  function begin(event: PointerEvent<HTMLElement>) {
    if (busy || !event.isPrimary || event.button !== 0) return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLElement>) {
    if (start.current?.id !== event.pointerId) return;
    const x = event.clientX - start.current.x;
    const y = event.clientY - start.current.y;
    setDistance(Math.abs(x) > Math.abs(y) ? Math.max(-150, Math.min(150, x)) : 0);
  }

  function reset() {
    start.current = null;
    setDistance(0);
  }

  function finish(event: PointerEvent<HTMLElement>) {
    if (start.current?.id !== event.pointerId) return;
    const x = event.clientX - start.current.x;
    const y = event.clientY - start.current.y;
    reset();
    if (busy || Math.abs(x) <= Math.abs(y)) return;
    if (x <= -swipeThreshold) onSkip();
    if (x >= swipeThreshold) onMessage();
  }

  return (
    <div className="buddy-deck">
      <article className="buddy-card buddy-swipe-card" aria-label={`${buddy.display_name}, taste buddy`} tabIndex={0}
        aria-keyshortcuts="ArrowLeft ArrowRight" style={{ transform: `translateX(${distance}px) rotate(${distance / 20}deg)` }}
        onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={reset} onLostPointerCapture={reset}
        onKeyDown={(event) => {
          if (busy || event.repeat || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
          event.preventDefault();
          if (event.key === "ArrowLeft") onSkip();
          else onMessage();
        }}>
        <div className="buddy-photo buddy-swipe-photo">
          {photo ? (
            <Image src={photo} fill sizes="(max-width: 430px) 100vw, 430px" alt="" draggable={false} />
          ) : (
            <div className="buddy-portrait"><CharacterPortrait identity={buddy.id} appearance={buddy.character} /></div>
          )}
          {buddy.match_percent !== null && <span>{buddy.match_percent}% match</span>}
          {Math.abs(distance) >= 24 && <strong className="buddy-swipe-label" data-direction={distance < 0 ? "skip" : "message"} aria-hidden="true">
            {distance < 0 ? "Skip" : "Message"}
          </strong>}
        </div>
        <div className="buddy-info">
          <div><h2>{buddy.age ? `${buddy.display_name.split(" ")[0]}, ${buddy.age}` : buddy.display_name}</h2>{buddy.location && <p>{buddy.location}</p>}</div>
          {photo && <CharacterPortrait identity={buddy.id} appearance={buddy.character} size={32} />}
        </div>
        <p className="buddy-description">{describeBuddyInterests(interests)}</p>
        {interests.length > 0 && <div className="taste-tags">{interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}
        {buddy.sharedSaves && <p className="buddy-shared-saves"><strong>{buddy.sharedSaves.count} shared saves</strong> including {buddy.sharedSaves.places}.</p>}
      </article>
      <div className="buddy-swipe-actions">
        <button type="button" aria-label="Skip" title="Skip" disabled={busy} onClick={onSkip}>
          <span><Icon name="arrow" size={17} /></span>
          <small aria-hidden="true">Skip</small>
        </button>
        <p>Swipe or use the arrows</p>
        <button type="button" aria-label="Message" title="Message" disabled={busy} onClick={onMessage}>
          <span><Icon name="arrow" size={17} /></span>
          <small aria-hidden="true">Message</small>
        </button>
      </div>
    </div>
  );
}
