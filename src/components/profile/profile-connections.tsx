import { useCallback } from "react";
import { useProfilePages } from "@/hooks/use-profile-pages";
import { profileClient } from "@/lib/api-client/profile";
import type { ConnectionDirection, ProfileConnection } from "@/types/profile";
import { ProfileSubscreen } from "./profile-subscreen";

const titles = { followers: "Followers", following: "Following" };
const demoPeople = {
  followers: ["Elena Rivera", "James Reed", "Nora Patel", "Avery Chen", "Jordan Ellis", "Sam Torres"],
  following: ["Elena Rivera", "Alex Bennett", "Nora Patel", "Riley Brooks", "Jamie Kim"],
};

export function ProfileConnections({ direction, owner, count, onClose }: {
  direction: ConnectionDirection;
  owner: { name: string; demo: boolean };
  count: number;
  onClose: () => void;
}) {
  return (
    <ProfileSubscreen title={titles[direction]} subtitle={owner.name} count={count}
      countLabel={direction === "followers" ? `${count} ${count === 1 ? "follower" : "followers"}` : `Following ${count} ${count === 1 ? "person" : "people"}`}
      backLabel="Back to profile" onBack={onClose}>
      {owner.demo ? <>
        <p className="place-lists-message">Sample {direction === "followers" ? "followers" : "people Mia follows"}</p>
        <PeopleRows direction={direction} people={demoPeople[direction].map((name) => ({ id: name, display_name: name }))} />
      </> : <LiveConnections key={direction} direction={direction} />}
    </ProfileSubscreen>
  );
}

function LiveConnections({ direction }: { direction: ConnectionDirection }) {
  const getPage = useCallback((offset: number, signal: AbortSignal) => (
    profileClient.getConnections(direction, offset, signal)
  ), [direction]);
  const { items, status, hasMore, loadMore, retry } = useProfilePages(getPage);

  return (
    <>
      {items.length > 0 && <PeopleRows direction={direction} people={items} />}
      {status === "ready" && items.length === 0 && <p className="place-lists-message">
        {direction === "followers" ? "You don’t have any followers yet." : "You aren’t following anyone yet."}
      </p>}
      {status === "loading" && <p className="place-lists-message" role="status">Loading people…</p>}
      {status === "error" && <p className="place-lists-message" role="alert">
        Couldn’t load this list. <button type="button" className="profile-history-button" onClick={retry}>Try again</button>
      </p>}
      {status === "ready" && hasMore && <button type="button" className="place-lists-action" onClick={loadMore}>Load more people</button>}
    </>
  );
}

function PeopleRows({ direction, people }: { direction: ConnectionDirection; people: ProfileConnection[] }) {
  return (
    <ul className="place-lists-rows" aria-label={direction === "followers" ? "People who follow you" : "People you follow"}>
      {people.map(({ id, display_name }) => (
        <li key={id} className="place-list-card">
          <span className="place-list-icon font-bold" aria-hidden="true">
            {display_name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
          </span>
          <span className="place-list-copy"><strong>{display_name}</strong></span>
        </li>
      ))}
    </ul>
  );
}
