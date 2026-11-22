import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/api-client/auth";
import { buddyClient } from "@/lib/api-client/buddies";
import type { BuddyMessage } from "@/types/buddies";

export function useBuddySend(buddyId: string, demo: boolean, onSent: (message: BuddyMessage) => void) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ id: string; body: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const id = pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { id, body };
    try {
      let message: BuddyMessage;
      if (demo) {
        message = { id, body, from_you: true, sent_at: new Date().toISOString() };
      } else {
        const session = await authClient.getSession();
        message = await buddyClient.send(buddyId, id, body, session.csrf_token);
      }
      pending.current = null;
      setDraft("");
      onSent(message);
    } catch {
      setError("Couldn’t send your message. Try again.");
    } finally {
      setSending(false);
    }
  }

  return { draft, setDraft, sending, error, submit };
}
