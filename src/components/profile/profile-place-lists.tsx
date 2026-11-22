import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { useOffsetPages } from "@/hooks/use-offset-pages";
import { profileClient } from "@/lib/api-client/profile";
import type { DemoPlaceList, ListedPlace } from "./demo-place-lists";
import { ProfileSubscreen } from "./profile-subscreen";

export type ListOwner = { name: string } & ({ demo: true } | { demo: false; bookmarkCount: number });

type Screen = { kind: "lists" | "new" | "bookmarks" } | { kind: "detail"; list: DemoPlaceList };

export function ProfilePlaceLists({ owner, demoLists, onAdd, onClose }: {
  owner: ListOwner;
  demoLists: DemoPlaceList[];
  onAdd: (list: DemoPlaceList) => void;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<Screen>({ kind: "lists" });
  const rootScreen = screen.kind === "lists";
  const title = screen.kind === "detail" ? screen.list.name
    : screen.kind === "bookmarks" ? "Saved places" : screen.kind === "new" ? "New list" : "Lists";
  const count = screen.kind === "detail" ? screen.list.places.length
    : owner.demo ? demoLists.length : screen.kind === "bookmarks" ? owner.bookmarkCount : 1;

  function goBack() {
    if (rootScreen) onClose();
    else setScreen({ kind: "lists" });
  }

  return (
    <ProfileSubscreen key={screen.kind} title={title} subtitle={rootScreen ? owner.name : "Lists"}
      count={screen.kind === "new" ? undefined : count}
      countLabel={rootScreen ? `${count} lists` : savedPlaceCount(count)}
      backLabel={rootScreen ? "Back to profile" : "Back to lists"} onBack={goBack}>
        {rootScreen && <>
          {owner.demo && (
            <div className="place-lists-toolbar">
              <p>Collections for every kind of plan.</p>
              <button type="button" className="place-lists-action" onClick={() => setScreen({ kind: "new" })}>
                <Icon name="plus" size={16} /> New list
              </button>
            </div>
          )}
          <ul className="place-lists-rows" aria-label="Place collections">
            {owner.demo ? demoLists.map((list) => (
              <CollectionRow key={list.id} name={list.name} icon={list.icon} count={list.places.length}
                onClick={() => setScreen({ kind: "detail", list })} />
            )) : (
              <CollectionRow name="Saved places" icon="bookmark" count={owner.bookmarkCount}
                onClick={() => setScreen({ kind: "bookmarks" })} />
            )}
          </ul>
        </>}
        {screen.kind === "detail" && <PlaceRows places={screen.list.places} />}
        {screen.kind === "bookmarks" && <BookmarkRows />}
        {screen.kind === "new" && <NewDemoList onCreate={(list) => {
          onAdd(list);
          setScreen({ kind: "detail", list });
        }} />}
    </ProfileSubscreen>
  );
}

function savedPlaceCount(count: number) {
  return `${count} saved ${count === 1 ? "place" : "places"}`;
}

function CollectionRow({ name, icon, count, onClick }: {
  name: string;
  icon: DemoPlaceList["icon"];
  count: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button type="button" className="place-list-card" onClick={onClick}>
        <span className="place-list-icon" data-icon={icon}><Icon name={icon} size={21} /></span>
        <span className="place-list-copy"><strong>{name}</strong><small>{savedPlaceCount(count)}</small></span>
        <span className="place-list-arrow"><Icon name="arrow" size={17} /></span>
      </button>
    </li>
  );
}

function PlaceRows({ places }: { places: ListedPlace[] }) {
  if (!places.length) return <p className="place-lists-message">This list has no saved places yet.</p>;
  return (
    <ul className="place-lists-rows" aria-label="Saved places">
      {places.map((place) => (
        <li className="place-list-card place-list-place" key={place.id ?? `${place.name}-${place.location}`}>
          <span className="place-list-icon" data-icon="pin"><Icon name="pin" size={19} /></span>
          <span className="place-list-copy"><strong>{place.name}</strong><small>{place.location}</small></span>
          {place.mapUrl && <a className="place-list-arrow" href={place.mapUrl} target="_blank" rel="noreferrer" aria-label={`Open ${place.name} in Google Maps`}>
            <Icon name="arrow" size={17} />
          </a>}
        </li>
      ))}
    </ul>
  );
}

function BookmarkRows() {
  const { items: places, status, hasMore, loadMore, retry } = useOffsetPages(profileClient.getBookmarks);

  return (
    <>
      {(places.length > 0 || status === "ready") && (
        <PlaceRows places={places.map(({ id, name, latitude, longitude }) => ({
          id,
          name,
          location: `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? "S" : "N"}, ${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? "W" : "E"}`,
          mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`,
        }))} />
      )}
      {status === "loading" && <p className="place-lists-message" role="status">Loading saved places…</p>}
      {status === "error" && <p className="place-lists-message" role="alert">Couldn’t load saved places. <button type="button" className="profile-history-button" onClick={retry}>Try again</button></p>}
      {status === "ready" && hasMore && <button type="button" className="place-lists-action" onClick={loadMore}>Load more places</button>}
    </>
  );
}

function NewDemoList({ onCreate }: { onCreate: (list: DemoPlaceList) => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("listName")).trim();
    const place = String(fields.get("placeName")).trim();
    const location = String(fields.get("location")).trim();
    if (!name || Boolean(place) !== Boolean(location)) {
      setError(name ? "Enter both a place name and its location." : "Enter a name for your list.");
      return;
    }
    onCreate({ id: crypto.randomUUID(), name, icon: "bookmark", places: place ? [{ name: place, location }] : [] });
  }

  return (
    <form className="place-list-form" onSubmit={submit}>
      <label>List name<input name="listName" required maxLength={80} /></label>
      <fieldset>
        <legend>First place (optional)</legend>
        <label>Place name<input name="placeName" maxLength={120} /></label>
        <label>Location<input name="location" maxLength={160} /></label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="place-lists-action">Create list</button>
    </form>
  );
}
