import { useEffect, useRef } from "react";
import { CharacterFigure } from "@/components/profile/character-figure";
import { Icon } from "@/components/ui/icon";
import { useBuddySend } from "@/hooks/use-buddy-send";
import type { BuddyMessage, BuddySuggestion } from "@/types/buddies";
import { defaultCharacter } from "@/types/character";

const starters = ["Want to check it out?", "What should I try first?"];

export function BuddyMatchSheet({ buddy, demo, onSent, onClose }: {
  buddy: BuddySuggestion;
  demo: boolean;
  onSent: (message: BuddyMessage) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const messageBox = useRef<HTMLTextAreaElement>(null);
  const { draft, setDraft, sending, error, submit } = useBuddySend(buddy.id, demo, onSent);
  const name = buddy.display_name.split(" ")[0];

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="buddy-match-sheet" aria-labelledby="buddy-match-heading" onCancel={(event) => {
      event.preventDefault();
      if (!sending) onClose();
    }}>
      <button type="button" className="sheet-close" aria-label="Close message" onClick={onClose} disabled={sending}>
        <Icon name="close" size={17} />
      </button>
      <div className="buddy-match-character"><CharacterFigure options={buddy.character ?? defaultCharacter(buddy.id)} /></div>
      <p className="eyebrow">{buddy.match_percent ? "It’s a taste match" : "Taste buddies"}</p>
      <h2 id="buddy-match-heading">Say hey to {name}</h2>
      <p className="buddy-match-copy">{buddy.sharedSaves
        ? `You both saved ${buddy.sharedSaves.places}. Start with something you already have in common.`
        : "Start with a place you’d like to discover together."}</p>
      <form aria-label="Send a message" onSubmit={submit}>
        <div className="buddy-starters">
          {starters.map((starter) => (
            <button type="button" key={starter} disabled={sending} onClick={() => {
              setDraft(starter);
              messageBox.current?.focus();
            }}>{starter}</button>
          ))}
        </div>
        <textarea ref={messageBox} aria-label="Message" placeholder={`Message ${name}…`} rows={3}
          value={draft} maxLength={2000} disabled={sending} onChange={(event) => setDraft(event.target.value)} />
        {error && <p className="buddy-send-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={!draft.trim() || sending}>
          {sending ? "Sending…" : "Send message"}<Icon name="arrow" size={16} />
        </button>
      </form>
    </dialog>
  );
}
