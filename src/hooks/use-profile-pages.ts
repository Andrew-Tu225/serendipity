import { useEffect, useState } from "react";
import type { ProfilePage } from "@/types/profile";

export function useProfilePages<T extends { id: string }>(
  getPage: (offset: number, signal: AbortSignal) => Promise<ProfilePage<T>>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    getPage(offset, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setItems((current) => {
        if (offset === 0) return page.items;
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextOffset(page.nextOffset);
      setStatus("ready");
    }, () => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, [attempt, getPage, offset]);

  function loadMore() {
    if (nextOffset === null) return;
    setStatus("loading");
    setOffset(nextOffset);
  }

  function retry() {
    setStatus("loading");
    setAttempt((current) => current + 1);
  }

  return { items, status, hasMore: nextOffset !== null, loadMore, retry };
}
