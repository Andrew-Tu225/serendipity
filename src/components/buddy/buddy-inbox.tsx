import { useCallback, useState, type ReactNode } from "react";
import { CharacterPortrait } from "@/components/profile/character-portrait";
import { ProfileSubscreen } from "@/components/profile/profile-subscreen";
import { Icon } from "@/components/ui/icon";
import { useOffsetPages } from "@/hooks/use-offset-pages";
import { authClient } from "@/lib/api-client/auth";
import { buddyClient } from "@/lib/api-client/buddies";
import type { BuddyMessage, BuddyPerson, BuddyThread } from "@/types/buddies";
import { demoBuddies } from "./demo-buddies";

export type DemoMessages = Record<string, BuddyMessage[]>;

const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });

export function BuddyInbox({ demo, demoMessages, onReadDemo, onOpen, onClose }: {
  demo: boolean;
  demoMessages: DemoMessages;
  onReadDemo: (buddyId?: string) => void;
  onOpen: (buddy: BuddyPerson) => void;
  onClose: () => void;
}) {
  if (!demo) return <LiveInbox onOpen={onOpen} onClose={onClose} />;

  const threads = demoBuddies.flatMap((buddy) => {
    const messages = demoMessages[buddy.id] ?? [];
    const latest = messages.at(-1);
    const unread_count = messages.filter((message) => message.unread).length;
    return latest ? [{ buddy, latest, unread_count }] : [];
  }).sort((a, b) => Date.parse(b.latest.sent_at) - Date.parse(a.latest.sent_at));
  const unread = threads.reduce((total, thread) => total + thread.unread_count, 0);

  return (
    <InboxLayout unread={unread} onClose={onClose} onReadAll={() => onReadDemo()}>
      <InboxRows threads={threads} onOpen={(buddy) => { onReadDemo(buddy.id); onOpen(buddy); }} />
    </InboxLayout>
  );
}

function LiveInbox({ onOpen, onClose }: { onOpen: (buddy: BuddyPerson) => void; onClose: () => void }) {
  const [unread, setUnread] = useState(0);
  const [marking, setMarking] = useState(false);
  const [readError, setReadError] = useState("");
  const getPage = useCallback(async (offset: number, signal: AbortSignal) => {
    const page = await buddyClient.inbox(offset, signal);
    if (!signal.aborted) setUnread(page.unread_count);
    return { items: page.threads.map((thread) => ({ ...thread, id: thread.buddy.id })), nextOffset: page.next_offset };
  }, []);
  const { items, status, hasMore, loadMore, retry, reload } = useOffsetPages(getPage);

  async function readAll() {
    if (marking) return;
    setMarking(true);
    setReadError("");
    try {
      const session = await authClient.getSession();
      await buddyClient.markRead(session.csrf_token);
      reload();
    } catch {
      setReadError("Couldn’t mark messages as read. Try again.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <InboxLayout unread={unread} busy={marking || status === "loading"} onClose={onClose} onReadAll={readAll}>
      {readError && <p className="place-lists-message" role="alert">{readError}</p>}
      {(items.length > 0 || status === "ready") && <InboxRows threads={items} onOpen={onOpen} />}
      {status === "loading" && <p className="place-lists-message" role="status">Loading conversations…</p>}
      {status === "error" && <p className="place-lists-message" role="alert">Couldn’t load messages. <button type="button" className="profile-history-button" onClick={retry}>Try again</button></p>}
      {status === "ready" && hasMore && <button type="button" className="place-lists-action" onClick={loadMore}>Load more conversations</button>}
    </InboxLayout>
  );
}

function InboxLayout({ unread, busy, onClose, onReadAll, children }: {
  unread: number;
  busy?: boolean;
  onClose: () => void;
  onReadAll: () => void;
  children: ReactNode;
}) {
  return (
    <ProfileSubscreen title="Messages" subtitle="Taste buddies" backLabel="Close inbox" backIcon="close" onBack={onClose}
      headerAction={<button className="buddy-read-all" type="button" disabled={unread === 0 || busy} onClick={onReadAll}>Read all</button>}>
      <div className="buddy-inbox-summary" role="status">
        <span className="buddy-inbox-icon"><Icon name="message" size={18} /></span>
        <div><strong>{unread} unread {unread === 1 ? "message" : "messages"}</strong><small>From your Taste Buddies</small></div>
      </div>
      {children}
    </ProfileSubscreen>
  );
}

function InboxRows({ threads, onOpen }: { threads: BuddyThread[]; onOpen: (buddy: BuddyPerson) => void }) {
  if (!threads.length) return <p className="place-lists-message">No messages yet. Swipe right on a Taste Buddy to start a chat.</p>;

  return (
    <ul className="buddy-thread-list" aria-label="Conversations">
      {threads.map(({ buddy, latest, unread_count }) => {
        const date = new Date(latest.sent_at);
        const isToday = date.toDateString() === new Date().toDateString();
        return (
          <li key={buddy.id}>
            <button type="button" className="buddy-thread" data-unread={unread_count > 0} onClick={() => onOpen(buddy)}>
              <span className="buddy-thread-portrait">
                <CharacterPortrait identity={buddy.id} appearance={buddy.character} size={42} />
                {unread_count > 0 && <span className="buddy-thread-dot" aria-hidden="true" />}
              </span>
              <span className="buddy-thread-copy">
                <strong>{buddy.display_name}</strong>
                <small>{latest.from_you ? "You: " : ""}{latest.body}</small>
                {unread_count > 0 && <span className="sr-only">{unread_count} unread</span>}
              </span>
              <time dateTime={latest.sent_at}>{(isToday ? timeFormat : dayFormat).format(date)}</time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
