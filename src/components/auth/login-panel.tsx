"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/api-client";

export function LoginPanel() {
  const searchParams = useSearchParams();
  const [starting, setStarting] = useState(false);
  const error = searchParams.get("error");

  return (
    <main className="m-auto w-full max-w-md px-6 py-16">
      <p className="mb-3 text-sm font-medium tracking-wide">Serendipity</p>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Sign in or create an account with Auth0.
      </p>
      {error && (
        <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-400">
          {error === "authentication_unavailable"
            ? "The sign-in service is unavailable. Please try again."
            : "Sign-in was canceled or could not be verified. Please try again."}
        </p>
      )}
      <button
        type="button"
        disabled={starting}
        onClick={() => {
          setStarting(true);
          authClient.startLogin();
        }}
        className="mt-8 w-full rounded-lg bg-foreground px-5 py-3 font-medium text-background disabled:opacity-60"
      >
        {starting ? "Opening Auth0…" : "Sign in / Sign up"}
      </button>
    </main>
  );
}
