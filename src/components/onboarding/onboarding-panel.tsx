"use client";

import { useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { authClient } from "@/lib/api-client/auth";
import { profileClient } from "@/lib/api-client/profile";
import { placeCategories, type PlaceCategory } from "@/types/discovery";
import { categoryLabels } from "@/types/profile";

export function OnboardingPanel() {
  const { session, refresh } = useSession();
  const [interests, setInterests] = useState<PlaceCategory[]>([]);
  const [pending, setPending] = useState<"save" | "logout" | null>(null);
  const [error, setError] = useState("");
  if (!session) return null;
  const name = session.user.display_name?.trim().split(/\s+/)[0];
  async function finish() {
    if (!session || pending || !interests.length) return;
    setPending("save"); setError("");
    try {
      await profileClient.complete(interests, session.csrf_token);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your interests.");
    } finally { setPending(null); }
  }
  return <main className="min-h-dvh bg-[#ebe5f5] text-[#292333] sm:py-6">
    <div className="app-shell onboarding-shell">
      <div className="status-bar" aria-hidden="true">
        <span>9:41</span>
        <div className="status-icons"><span className="signal"/><span className="wifi"/><span className="battery"/></div>
      </div>
      <div className="onboarding-content">
        <div className="account-page onboarding-page">
          <p className="eyebrow">SERENDIPITY · MAKE IT YOURS</p>
          <span className="onboarding-symbol" aria-hidden="true">✦</span>
          <h1>Welcome{name ? `, ${name}` : ""}.</h1>
          <p className="account-intro">What do you love discovering?</p>
          <p>Pick the places you’re drawn to. We’ll help you discover experiences shared by people with similar taste.</p>
          <fieldset disabled={pending !== null} className="interest-fieldset">
            <legend>Choose at least one interest</legend>
            <div className="interest-grid">{placeCategories.map((category) => <button type="button" key={category}
              aria-pressed={interests.includes(category)} className="interest-chip"
              onClick={() => setInterests((current) => current.includes(category)
                ? current.filter((item) => item !== category) : [...current, category])}>
              {categoryLabels[category]}{interests.includes(category) && <span aria-hidden="true"> ✓</span>}
            </button>)}</div>
          </fieldset>
          <p className="account-note">Your interests are a starting point. Your reviews will help your taste profile grow.</p>
        </div>
      </div>
      <footer className="onboarding-actions">
        {error && <p role="alert">{error}</p>}
        <p id="onboarding-continue-hint" className="onboarding-continue-hint" aria-live="polite">
          {interests.length ? `${interests.length} ${interests.length === 1 ? "interest" : "interests"} selected` : "Choose at least one interest to continue."}
        </p>
        <button className="primary-button" aria-describedby="onboarding-continue-hint" disabled={pending !== null || !interests.length} onClick={() => void finish()}>
          {pending === "save" ? "Saving your interests…" : "Continue"}
        </button>
        <button className="text-button" disabled={pending !== null} onClick={() => {
          setPending("logout");
          void authClient.signOut(session.csrf_token).catch((failure: Error) => { setError(failure.message); setPending(null); });
        }}>{pending === "logout" ? "Signing out…" : "Sign out"}</button>
      </footer>
    </div>
  </main>;
}
