import { useEffect, useRef, useState } from "react";
import { CharacterPortrait } from "@/components/profile/character-portrait";
import { ProfileSubscreen } from "@/components/profile/profile-subscreen";
import { useBuddySend } from "@/hooks/use-buddy-send";
import { authClient } from "@/lib/api-client/auth";
import { buddyClient } from "@/lib/api-client/buddies";
import type { BuddyMessage, BuddyPerson } from "@/types/buddies";

const timeFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function BuddyChat({ buddy, demo, demoMessages, initialMessage, onDemoMessage, onSent, onBack }: {
  buddy: BuddyPerson;
  demo: boolean;
  demoMessages: BuddyMessage[];
  initialMessage?: BuddyMessage;
  onDemoMessage: (message: BuddyMessage) => void;
  onSent: () => void;
  onBack: () => void;
}) {
  const [liveMessages, setLiveMessages] = useState<BuddyMessage[]>(() => initialMessage ? [initialMessage] : []);
  const [before, setBefore] = useState<string | null>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const end = useRef<HTMLLIElement>(null);
  const messages = demo ? demoMessages : liveMessages;
  const lastId = messages.at(-1)?.id;
  const { draft, setDraft, sending, error: sendError, submit } = useBuddySend(buddy.id, demo, (message) => {
    if (demo) onDemoMessage(message);
    else setLiveMessages((current) => mergeMessages(current, [message]));
    onSent();
  });

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    async function refresh(showError: boolean) {
      try {
        const history = await buddyClient.history(buddy.id, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setLiveMessages((current) => mergeMessages(current, history.messages));
        setBefore((current) => current === undefined ? history.next_before : current);
        if (showError) setHistoryError("");
        if (showError || history.messages.some((message) => message.unread)) {
          void authClient.getSession(controller.signal)
            .then((session) => buddyClient.markRead(session.csrf_token, buddy.id, controller.signal))
            .catch(() => { /* The next refresh retries the acknowledgement. */ });
        }
      } catch {
        if (!controller.signal.aborted && showError) setHistoryError("Couldn’t load messages.");
      }
    }
    void refresh(true);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, 4000);
    return () => { controller.abort(); window.clearInterval(poll); };
  }, [attempt, buddy.id, demo]);

  useEffect(() => {
    if (lastId) end.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  async function loadOlder() {
    if (!before || loadingOlder) return;
    setLoadingOlder(true);
    setHistoryError("");
    try {
      const history = await buddyClient.history(buddy.id, before);
      setLiveMessages((current) => mergeMessages(current, history.messages));
      setBefore(history.next_before);
    } catch {
      setHistoryError("Couldn’t load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <ProfileSubscreen title={buddy.display_name} subtitle="Taste buddies" backLabel="Back to inbox" backIcon="close" onBack={onBack}
      footer={<form className="buddy-composer" aria-label="Send a message" onSubmit={submit}>
        {sendError && <p role="alert">{sendError}</p>}
        <div>
          <textarea aria-label="Message" placeholder="Write a message…" rows={1} value={draft} disabled={sending}
            maxLength={2000} onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />
          <button className="place-lists-action" type="submit" disabled={!draft.trim() || sending}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>}>
      {before && <button className="profile-history-button" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Earlier messages"}</button>}
      {!demo && before === undefined && !historyError && <p className="place-lists-message" role="status">Loading messages…</p>}
      {historyError && <p className="place-lists-message" role="alert">{historyError} <button type="button" className="profile-history-button" onClick={() => {
        if (before) void loadOlder();
        else { setHistoryError(""); setAttempt((current) => current + 1); }
      }}>Try again</button></p>}
      {!messages.length && (demo || before !== undefined) && <p className="place-lists-message">Say hello to {buddy.display_name}.</p>}
      <ol className="buddy-messages" aria-label="Messages" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id} ref={message.id === lastId ? end : undefined} className="buddy-message" data-sender={message.from_you ? "you" : "buddy"}>
            {!message.from_you && <CharacterPortrait identity={buddy.id} appearance={buddy.character} size={28} />}
            <div>
              <p>{message.body}</p>
              <time dateTime={message.sent_at}>{timeFormat.format(new Date(message.sent_at))}</time>
            </div>
          </li>
        ))}
      </ol>
    </ProfileSubscreen>
  );
}

function mergeMessages(current: BuddyMessage[], incoming: BuddyMessage[]) {
  const byId = new Map([...current, ...incoming].map((message) => [message.id, message]));
  return [...byId.values()].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at) || a.id.localeCompare(b.id));
}
