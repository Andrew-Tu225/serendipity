import { useEffect, useState } from "react";
import { demoBuddies } from "@/components/buddy/demo-buddies";
import { authClient } from "@/lib/api-client/auth";
import { buddyClient } from "@/lib/api-client/buddies";
import { ApiError } from "@/lib/api-client/client";
import type { BuddySuggestion } from "@/types/buddies";

export function useBuddyDeck(active: boolean) {
  const [status, setStatus] = useState<"loading" | "ready" | "demo" | "error">("loading");
  const [cards, setCards] = useState<BuddySuggestion[]>([]);
  const [sampleCards, setSampleCards] = useState(demoBuddies);
  const [attempt, setAttempt] = useState(0);
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState("");

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    buddyClient.suggestions(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setCards(data);
      setStatus("ready");
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      setStatus(error instanceof ApiError && error.status === 401 ? "demo" : "error");
    });
    return () => controller.abort();
  }, [active, attempt]);

  function reload() {
    setStatus("loading");
    setAttempt((current) => current + 1);
  }

  function remove(id: string) {
    setCards((current) => current.filter((buddy) => buddy.id !== id));
    setSampleCards((current) => current.filter((buddy) => buddy.id !== id));
  }

  async function skip(id: string) {
    if (skipping) return;
    setSkipError("");
    if (status === "demo") {
      remove(id);
      return;
    }
    setSkipping(true);
    try {
      const session = await authClient.getSession();
      await buddyClient.skip(id, session.csrf_token);
      remove(id);
    } catch {
      setSkipError("Couldn’t skip this buddy. Try again.");
    } finally {
      setSkipping(false);
    }
  }

  return {
    status, cards: status === "demo" ? sampleCards : cards, reload, remove, skip, skipping, skipError,
  };
}
