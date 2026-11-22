"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { authClient } from "@/lib/api-client/auth";
import { profileClient } from "@/lib/api-client/profile";
import { categoryLabels, type MyProfile } from "@/types/profile";

export function ProfileView() {
  const { session } = useSession();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    profileClient.get(controller.signal).then(setProfile).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [attempt]);
  if (!session) return null;
  const name = session.user.display_name?.trim() || "Explorer";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  return <section className="profile-view">
    <div className="profile-card">
      <div className="account-avatar">{session.user.picture_url && !avatarFailed
        // Auth0 image hosts vary by identity provider.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={session.user.picture_url} alt="" referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} />
        : <span aria-hidden="true">{initials}</span>}</div>
      <div className="profile-name"><h2>{name}</h2><p>Your discoveries, your perspective.</p></div>
      {profile ? <div className="profile-stats">
        <div><strong>{profile.experience_count}</strong><span>Experiences</span></div>
        <div><strong>{profile.saved_place_count}</strong><span>Saved places</span></div>
        <div><strong>{profile.following_count}</strong><span>Following</span></div>
      </div> : !error && <p role="status">Loading your profile…</p>}
    </div>
    {profile && <div className="taste-panel">
      <div className="panel-heading"><div><p className="eyebrow">YOUR INTERESTS</p><h3>Places you’re drawn to</h3></div></div>
      <div className="interest-grid">{profile.interests.map((category) => <span className="interest-tag" key={category}>{categoryLabels[category]}</span>)}</div>
      <p className="panel-intro">Your interests and reviews help us find people with similar taste.</p>
      {profile.experience_count === 0 && <p className="panel-intro">No Experiences yet. Explore the map and share your first visit.</p>}
    </div>}
    {error && <div role="alert">{error}<button className="text-button" onClick={() => { setError(""); setAttempt((n) => n + 1); }}>Try again</button></div>}
    <button className="primary-button" disabled={leaving} onClick={() => {
      setLeaving(true);
      void authClient.signOut(session.csrf_token).catch((failure: Error) => { setError(failure.message); setLeaving(false); });
    }}>{leaving ? "Signing out…" : "Sign out"}</button>
  </section>;
}
