import { useCallback, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { useOffsetPages } from "@/hooks/use-offset-pages";
import { profileClient } from "@/lib/api-client/profile";
import { authClient } from "@/lib/api-client/auth";
import type { ProfileListCreate, ProfileListEntry, ProfileListSummary } from "@/types/profile";
import type { DemoPlaceList, ListedPlace } from "./demo-place-lists";
import { ProfileSubscreen } from "./profile-subscreen";

export type ListOwner = { name: string } & ({ demo: true } | {
  demo: false;
  userId: string;
  bookmarkCount: number;
  listCount: number;
});

type Screen = { kind: "lists" | "new" | "bookmarks" }
  | { kind: "detail"; list: DemoPlaceList }
  | { kind: "live-detail"; list: ProfileListSummary };

export function ProfilePlaceLists({ owner, demoLists, onSaveDemo, onCreated, onClose }: {
  owner: ListOwner;
  demoLists: DemoPlaceList[];
  onSaveDemo: (list: DemoPlaceList) => void;
  onCreated?: () => void;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<Screen>({ kind: "lists" });
  const [created, setCreated] = useState(0);
  const [adding, setAdding] = useState(false);
  const rootScreen = screen.kind === "lists";
  const title = screen.kind === "detail" || screen.kind === "live-detail" ? screen.list.name
    : screen.kind === "bookmarks" ? "Saved places" : screen.kind === "new" ? "New list" : "Lists";
  const count = screen.kind === "detail" ? screen.list.places.length
    : screen.kind === "live-detail" ? screen.list.entry_count
    : owner.demo ? demoLists.length : screen.kind === "bookmarks" ? owner.bookmarkCount : owner.listCount + created;

  function goBack() {
    if (adding) setAdding(false);
    else if (rootScreen) onClose();
    else setScreen({ kind: "lists" });
  }

  async function csrfToken() {
    const session = await authClient.getSession();
    if (owner.demo || session.user.id !== owner.userId) throw new Error("Reopen Profile to use your current account.");
    return session.csrf_token;
  }

  return (
    <ProfileSubscreen key={screen.kind} title={title} subtitle={rootScreen ? owner.name : "Lists"}
      count={screen.kind === "new" ? undefined : count}
      countLabel={rootScreen ? `${count} lists` : savedPlaceCount(count)}
      backLabel={rootScreen ? "Back to profile" : "Back to lists"} onBack={goBack}>
        {rootScreen && <>
          <div className="place-lists-toolbar">
            <button type="button" className="place-lists-action" onClick={() => setScreen({ kind: "new" })}>
              <Icon name="plus" size={16} /> New list
            </button>
          </div>
          {owner.demo ? <ul className="place-lists-rows" aria-label="Place collections">
            {demoLists.map((list) => (
              <CollectionRow key={list.id} name={list.name} icon={list.icon} count={list.places.length}
                onClick={() => setScreen({ kind: "detail", list })} />
            ))}
          </ul> : <LiveCollections bookmarkCount={owner.bookmarkCount}
            onBookmarks={() => setScreen({ kind: "bookmarks" })}
            onSelect={(list) => setScreen({ kind: "live-detail", list })} />}
        </>}
        {screen.kind === "detail" && <>
          {!adding && <>
            <PlaceRows places={screen.list.places} />
            <AddEntryButton onClick={() => setAdding(true)} />
          </>}
          {adding && <ListForm addEntry={async (entry) => {
            const list = { ...screen.list, places: [...screen.list.places, entry] };
            onSaveDemo(list);
            setScreen({ kind: "detail", list });
            setAdding(false);
          }} />}
        </>}
        {screen.kind === "live-detail" && <LiveEntries key={screen.list.id} list={screen.list}
          adding={adding} onAdd={() => setAdding(true)} onSave={async (entry) => {
            await profileClient.addListEntry(screen.list.id, entry, await csrfToken());
            setScreen({ kind: "live-detail", list: { ...screen.list, entry_count: screen.list.entry_count + 1 } });
            setAdding(false);
          }} />}
        {screen.kind === "bookmarks" && <BookmarkRows />}
        {screen.kind === "new" && <ListForm createList={async (data) => {
          if (owner.demo) {
            const list: DemoPlaceList = { id: data.id, name: data.name, icon: "bookmark", places: data.first_entry ? [data.first_entry] : [] };
            onSaveDemo(list);
            setScreen({ kind: "detail", list });
          } else {
            const list = await profileClient.createList(data, await csrfToken());
            setCreated((count) => count + 1);
            onCreated?.();
            setScreen({ kind: "live-detail", list });
          }
        }} />}
    </ProfileSubscreen>
  );
}

function savedPlaceCount(count: number) {
  return `${count} saved ${count === 1 ? "place" : "places"}`;
}

function LiveCollections({ bookmarkCount, onBookmarks, onSelect }: {
  bookmarkCount: number;
  onBookmarks: () => void;
  onSelect: (list: ProfileListSummary) => void;
}) {
  const { items, status, hasMore, loadMore, retry } = useOffsetPages(profileClient.getLists);
  return (
    <>
      <ul className="place-lists-rows" aria-label="Place collections">
        <CollectionRow name="Saved places" icon="bookmark" count={bookmarkCount} onClick={onBookmarks} />
        {items.map((list) => <CollectionRow key={list.id} name={list.name} icon="bookmark"
          count={list.entry_count} onClick={() => onSelect(list)} />)}
      </ul>
      {status === "loading" && <p className="place-lists-message" role="status">Loading lists…</p>}
      {status === "error" && <p className="place-lists-message" role="alert">Couldn’t load lists. <button type="button" className="profile-history-button" onClick={retry}>Try again</button></p>}
      {status === "ready" && hasMore && <button type="button" className="place-lists-action" onClick={loadMore}>Load more lists</button>}
    </>
  );
}

function AddEntryButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="place-lists-action" onClick={onClick}><Icon name="plus" size={16} /> Add experience</button>;
}

function LiveEntries({ list, adding, onAdd, onSave }: {
  list: ProfileListSummary;
  adding: boolean;
  onAdd: () => void;
  onSave: (entry: ProfileListEntry) => Promise<void>;
}) {
  const getPage = useCallback((offset: number, signal: AbortSignal) => profileClient.getListEntries(list.id, offset, signal), [list.id]);
  const { items, status, hasMore, loadMore, retry, reload } = useOffsetPages(getPage);
  if (adding) return <ListForm addEntry={async (entry) => { await onSave(entry); reload(); }} />;
  return (
    <>
      {(items.length > 0 || status === "ready") && <PlaceRows places={items} />}
      {status === "loading" && <p className="place-lists-message" role="status">Loading experiences…</p>}
      {status === "error" && <p className="place-lists-message" role="alert">Couldn’t load experiences. <button type="button" className="profile-history-button" onClick={retry}>Try again</button></p>}
      {status === "ready" && hasMore && <button type="button" className="place-lists-action" onClick={loadMore}>Load more experiences</button>}
      <AddEntryButton onClick={onAdd} />
    </>
  );
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

function ListForm({ createList, addEntry }: {
  createList?: (list: ProfileListCreate) => Promise<void>;
  addEntry?: (entry: ProfileListEntry) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const ids = useRef<{ list: string; entry: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("listName") ?? "").trim();
    const place = String(fields.get("experienceName")).trim();
    const location = String(fields.get("location")).trim();
    if (createList && !name) { setError("Enter a name for your list."); return; }
    if (Boolean(place) !== Boolean(location) || (!createList && !place)) {
      setError("Enter both an experience name and its location."); return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    ids.current ??= { list: crypto.randomUUID(), entry: crypto.randomUUID() };
    const entry = { id: ids.current.entry, name: place, location };
    try {
      if (createList) await createList({ id: ids.current.list, name, first_entry: place ? entry : undefined });
      else await addEntry?.(entry);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn’t save this list.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="place-list-form" onSubmit={submit}>
      {createList && <label>List name<input name="listName" required maxLength={80} disabled={saving} /></label>}
      <fieldset disabled={saving}>
        {createList && <legend>First experience (optional)</legend>}
        <label>Experience name<input name="experienceName" required={!createList} maxLength={120} /></label>
        <label>Location<input name="location" required={!createList} maxLength={160} /></label>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="place-lists-action" disabled={saving}>
        {saving ? "Saving…" : createList ? "Create list" : "Save experience"}
      </button>
    </form>
  );
}
