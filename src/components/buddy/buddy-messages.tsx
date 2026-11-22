import { useEffect, useRef, useState, type FormEvent } from "react";
import { CharacterPortrait } from "@/components/profile/character-portrait";
import { ProfileSubscreen } from "@/components/profile/profile-subscreen";
import { useOffsetPages } from "@/hooks/use-offset-pages";
import { authClient } from "@/lib/api-client/auth";
import { buddyClient } from "@/lib/api-client/buddies";
import type { BuddyMessage, BuddyPerson, BuddyThread } from "@/types/buddies";
import { demoBuddies } from "./demo-buddies";

export type DemoMessages = Record<string, BuddyMessage[]>;

const timeFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function getInboxPage(offset: number, signal: AbortSignal) {
  const page = await buddyClient.inbox(offset, signal);
  return { items: page.threads.map((thread) => ({ ...thread, id: thread.buddy.id })), nextOffset: page.next_offset };
}

export function BuddyInbox({ demo, demoMessages, onOpen, onClose }: {
  demo: boolean;
  demoMessages: DemoMessages;
  onOpen: (buddy: BuddyPerson) => void;
  onClose: () => void;
}) {
  const sampleThreads = demoBuddies.flatMap((buddy) => {
    const latest = demoMessages[buddy.id]?.at(-1);
    return latest ? [{ buddy, latest }] : [];
  }).sort((a, b) => Date.parse(b.latest.sent_at) - Date.parse(a.latest.sent_at));

  return (
    <ProfileSubscreen title="Inbox" subtitle="Taste buddies" backLabel="Back to Taste buddies" onBack={onClose}>
      {demo ? <InboxRows threads={sampleThreads} onOpen={onOpen} /> : <LiveInbox onOpen={onOpen} />}
    </ProfileSubscreen>
  );
}

function LiveInbox({ onOpen }: { onOpen: (buddy: BuddyPerson) => void }) {
  const { items, status, hasMore, loadMore, retry } = useOffsetPages(getInboxPage);

  return (
    <>
      {(items.length > 0 || status === "ready") && <InboxRows threads={items} onOpen={onOpen} />}
      {status === "loading" && <p className="place-lists-message" role="status">Loading conversations…</p>}
      {status === "error" && <p className="place-lists-message" role="alert">Couldn’t load the inbox. <button type="button" className="profile-history-button" onClick={retry}>Try again</button></p>}
      {status === "ready" && hasMore && <button type="button" className="place-lists-action" onClick={loadMore}>Load more conversations</button>}
    </>
  );
}

function InboxRows({ threads, onOpen }: { threads: BuddyThread[]; onOpen: (buddy: BuddyPerson) => void }) {
  if (!threads.length) return <p className="place-lists-message">No messages yet. Swipe right on a Taste Buddy to start a chat.</p>;

  return (
    <ul className="place-lists-rows" aria-label="Conversations">
      {threads.map(({ buddy, latest }) => (
        <li key={buddy.id}>
          <button type="button" className="place-list-card buddy-thread" onClick={() => onOpen(buddy)}>
            <CharacterPortrait identity={buddy.id} appearance={buddy.character} size={45} />
            <span className="place-list-copy">
              <strong>{buddy.display_name}</strong>
              <small>{latest.from_you ? "You: " : ""}{latest.body}</small>
            </span>
            <time dateTime={latest.sent_at}>{timeFormat.format(new Date(latest.sent_at))}</time>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function BuddyChat({ buddy, demo, demoMessages, onDemoMessage, onSent, onBack, backLabel }: {
  buddy: BuddyPerson;
  demo: boolean;
  demoMessages: BuddyMessage[];
  onDemoMessage: (message: BuddyMessage) => void;
  onSent: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const [liveMessages, setLiveMessages] = useState<BuddyMessage[]>([]);
  const [before, setBefore] = useState<string | null>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const pending = useRef<{ id: string; body: string } | null>(null);
  const end = useRef<HTMLLIElement>(null);
  const messages = demo ? demoMessages : liveMessages;
  const lastId = messages.at(-1)?.id;

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

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    const id = pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { id, body };
    try {
      if (demo) {
        onDemoMessage({ id, body, from_you: true, sent_at: new Date().toISOString() });
      } else {
        const session = await authClient.getSession();
        const message = await buddyClient.send(buddy.id, id, body, session.csrf_token);
        setLiveMessages((current) => mergeMessages(current, [message]));
      }
      pending.current = null;
      setDraft("");
      onSent();
    } catch {
      setSendError("Couldn’t send your message. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ProfileSubscreen title={buddy.display_name} subtitle="Taste buddies" backLabel={backLabel} onBack={onBack}
      footer={<form className="buddy-composer" aria-label="Send a message" onSubmit={send}>
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
