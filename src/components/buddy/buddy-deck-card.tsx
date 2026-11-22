import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { CharacterPortrait } from "@/components/profile/character-portrait";
import rooftopImage from "@/components/serendipity/assets/rooftop-dinner.png";
import { Icon } from "@/components/ui/icon";
import type { BuddySuggestion } from "@/types/buddies";

const swipeThreshold = 65;

export function BuddyDeckCard({ buddy, busy, onSkip, onMessage }: {
  buddy: BuddySuggestion;
  busy: boolean;
  onSkip: () => void;
  onMessage: () => void;
}) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const [distance, setDistance] = useState(0);

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
    <>
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
          {buddy.location && <Image src={rooftopImage} sizes="430px" alt="" draggable={false} />}
          <div className="buddy-portrait"><CharacterPortrait identity={buddy.id} appearance={buddy.character} size={112} /></div>
          {buddy.match_percent !== null && <span>{buddy.match_percent}% match</span>}
          {Math.abs(distance) >= 24 && <strong className="buddy-swipe-label" data-direction={distance < 0 ? "skip" : "message"} aria-hidden="true">
            {distance < 0 ? "Skip" : "Message"}
          </strong>}
        </div>
        <div className="buddy-info">
          <div><h2>{buddy.display_name}</h2>{buddy.location && <p>{buddy.location}</p>}</div>
        </div>
        {buddy.interests && <div className="taste-tags">{buddy.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}
      </article>
      <div className="buddy-swipe-actions">
        <button type="button" disabled={busy} onClick={onSkip}><Icon name="close" size={19} /> Skip</button>
        <button type="button" disabled={busy} onClick={onMessage}><Icon name="message" size={19} /> Message</button>
      </div>
    </>
  );
}
