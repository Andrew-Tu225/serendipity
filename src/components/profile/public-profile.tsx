"use client";

import { useCallback, useEffect, useState } from "react";
import { socialClient } from "@/lib/api-client/social";
import { ApiError } from "@/lib/api-client/client";
import { useOffsetPages } from "@/hooks/use-offset-pages";
import type { PublicPlace, PublicProfile as Profile } from "@/types/social";
import type { ConnectionDirection } from "@/types/profile";
import { CharacterPortrait } from "./character-portrait";
import { PeopleRows } from "./profile-connections";
import { ProfileSubscreen } from "./profile-subscreen";

export function PublicProfile({ userId, onBack, onConnections, onPlace }: {
  userId: string;
  onBack: () => void;
  onConnections: (direction: ConnectionDirection, name: string) => void;
  onPlace: (place: PublicPlace) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    socialClient.profile(userId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setProfile(data);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof ApiError && failure.status === 404
        ? "This profile is no longer available." : "Couldn’t load this profile.");
    });
    return () => controller.abort();
  }, [userId, attempt]);
  return <ProfileSubscreen title={profile?.display_name ?? "Profile"} subtitle="Your people" backLabel="Back to previous screen" onBack={onBack}>
    {!profile && !error && <p role="status" className="place-lists-message">Loading profile…</p>}
    {error && <p role="alert" className="place-lists-message">{error} <button className="profile-history-button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button></p>}
    {profile && <>
      <div className="public-profile-identity">
        <CharacterPortrait identity={profile.id} appearance={profile.character} size={88}/>
        <h2>{profile.display_name}</h2>
        <p>{profile.is_self ? "Your profile" : profile.is_following && profile.follows_you ? "You follow each other" : profile.is_following ? "Following" : profile.follows_you ? "Follows you" : "Explorer"}</p>
      </div>
      <div className="public-profile-stats">
        <div><strong>{profile.experience_count}</strong><span>Experiences</span></div>
        <button onClick={() => onConnections("followers", profile.display_name)}><strong>{profile.follower_count}</strong><span>Followers</span></button>
        <button onClick={() => onConnections("following", profile.display_name)}><strong>{profile.following_count}</strong><span>Following</span></button>
      </div>
      <h3 className="public-profile-section-title">Experiences</h3>
      <PublicHistory userId={userId} onPlace={onPlace}/>
    </>}
  </ProfileSubscreen>;
}

function PublicHistory({ userId, onPlace }: { userId: string; onPlace: (place: PublicPlace) => void }) {
  const getPage = useCallback((offset: number, signal: AbortSignal) => socialClient.experiences(userId, offset, signal), [userId]);
  const pages = useOffsetPages(getPage);
  return <>
    <ul className="public-experience-list">
      {pages.items.map(log => <li className="public-experience-card" key={log.id}>
        <button className="public-experience-place" onClick={() => onPlace(log.place)} aria-label={`View ${log.place.name} on map`}>{log.place.name}</button>
        <div className="public-experience-meta"><strong>★ {log.rating}/5</strong><span>{log.verdict === "recommend" ? "Recommended" : log.verdict === "avoid" ? "Would skip" : "Visited"}</span></div>
        {log.review && <p>{log.review}</p>}
        <small>Visited <time dateTime={log.visited_on}>{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${log.visited_on}T00:00:00Z`))}</time></small>
      </li>)}
    </ul>
    <PageStatus pages={pages} empty="No experiences yet." more="More experiences"/>
  </>;
}

export function PublicConnections({ userId, direction, name, onBack, onPerson }: {
  userId: string; direction: ConnectionDirection; name: string;
  onBack: () => void; onPerson: (id: string) => void;
}) {
  const getPage = useCallback((offset: number, signal: AbortSignal) => socialClient.connections(userId, direction, offset, signal), [userId, direction]);
  const pages = useOffsetPages(getPage);
  return <ProfileSubscreen title={direction === "followers" ? "Followers" : "Following"} subtitle={name} backLabel="Back to previous screen" onBack={onBack}>
    <PeopleRows label={direction === "followers" ? "Followers" : "Following"} direction={direction} people={pages.items} onPerson={onPerson}/>
    <PageStatus pages={pages} empty={direction === "followers" ? "No followers yet." : "Not following anyone yet."} more="More people"/>
  </ProfileSubscreen>;
}

function PageStatus({ pages, empty, more }: {
  pages: { status: string; items: unknown[]; hasMore: boolean; retry: () => void; loadMore: () => void };
  empty: string; more: string;
}) {
  return <>
    {pages.status === "loading" && <p className="place-lists-message" role="status">Loading…</p>}
    {pages.status === "error" && <p className="place-lists-message" role="alert">Couldn’t load this list. <button className="profile-history-button" onClick={pages.retry}>Try again</button></p>}
    {pages.status === "ready" && pages.items.length === 0 && <p className="place-lists-message">{empty}</p>}
    {pages.status === "ready" && pages.hasMore && <button className="place-lists-action" onClick={pages.loadMore}>{more}</button>}
  </>;
}
