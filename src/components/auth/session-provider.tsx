"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/api-client/auth";
import { ApiError } from "@/lib/api-client/client";
import type { AuthSession } from "@/types/auth";

interface SessionState { session: AuthSession | null; ready: boolean; error: string }
const SessionContext = createContext<{
  session: AuthSession | null;
  refresh: () => Promise<void>;
} | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("SessionProvider is required");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false, error: "" });
  const request = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const session = await authClient.getSession(controller.signal);
      if (!controller.signal.aborted) setState({ session, ready: true, error: "" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ session: null, ready: true, error: error instanceof ApiError && error.status === 401
        ? "" : error instanceof Error ? error.message : "Could not verify sign-in." });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void refresh(); });
    const focus = () => { if (!document.hidden) void refresh(); };
    const expired = () => {
      request.current?.abort();
      setState({ session: null, ready: true, error: "" });
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("serendipity:unauthorized", expired);
    return () => {
      mounted = false;
      request.current?.abort();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("serendipity:unauthorized", expired);
    };
  }, [refresh]);

  const destination = !state.session ? "/login"
    : state.session.user.onboarding_completed_at ? "/" : "/onboarding";
  const redirect = state.ready && !state.error && pathname !== destination
    && (pathname === "/login" || pathname === "/onboarding" || (pathname === "/" && destination !== "/"));
  useEffect(() => { if (redirect) router.replace(destination); }, [redirect, destination, router]);

  if (state.error) return <main className="account-page"><p role="alert">{state.error}</p>
    <button className="primary-button" onClick={() => void refresh()}>Try again</button></main>;
  if (!state.ready || redirect) return <main className="account-page"><p role="status">Checking sign-in…</p></main>;
  return <SessionContext.Provider value={{ session: state.session, refresh }}>
    <div key={state.session?.user.id ?? "guest"} className="session-content">{children}</div>
  </SessionContext.Provider>;
}
