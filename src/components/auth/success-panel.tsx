"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, authClient } from "@/lib/api-client";
import type { AuthSession } from "@/types/auth";

export function SuccessPanel() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    authClient.getSession(signal)
      .then((result) => {
        if (!signal.aborted) setSession(result);
      })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setSession(null);
          router.replace("/login");
          return;
        }
        setError(error instanceof Error ? error.message : "Unable to load your account.");
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [router, attempt]);

  async function signOut() {
    if (!session) return;
    setSigningOut(true);
    setError(null);
    try {
      await authClient.signOut(session.csrf_token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
        router.replace("/login");
        return;
      }
      setError(error instanceof Error ? error.message : "Unable to sign out.");
      setSigningOut(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      {loading && <p role="status">Loading your account…</p>}
      {error && (
        <div role="alert" className="mb-6">
          <p className="text-red-700 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSession(null);
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
            className="mt-2 underline"
          >
            Try again
          </button>
        </div>
      )}
      {!loading && session && (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Successful</h1>
          <Link href="/" className="mt-4 inline-block underline">Explore places</Link>
          <section aria-labelledby="auth0-heading" className="mt-8">
            <h2 id="auth0-heading" className="mb-3 text-lg font-medium">Auth0 payload</h2>
            <pre className="overflow-x-auto rounded-lg border border-zinc-300 bg-zinc-100 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              {JSON.stringify(session.auth0, null, 2)}
            </pre>
          </section>
          <section aria-labelledby="user-heading" className="mt-8">
            <h2 id="user-heading" className="mb-3 text-lg font-medium">Stored user account</h2>
            <pre className="overflow-x-auto rounded-lg border border-zinc-300 bg-zinc-100 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              {JSON.stringify(session.user, null, 2)}
            </pre>
          </section>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
            className="mt-8 rounded-lg bg-foreground px-5 py-3 font-medium text-background disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </>
      )}
    </main>
  );
}
