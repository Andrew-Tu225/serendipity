import type { StaticImageData } from "next/image";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { PlaceGlyph } from "@/components/map/place-marker";
import pottery from "@/components/serendipity/assets/pottery-workshop.png";
import rooftop from "@/components/serendipity/assets/rooftop-dinner.png";
import jazz from "./assets/jazz-club.webp";
import hike from "./assets/ridge-hike.webp";
import { profileClient } from "@/lib/api-client/profile";
import type { PlaceCategory } from "@/types/discovery";
import type { ProfileExperiences } from "@/types/profile";

type Entry = {
  id: string;
  place: string;
  title: string;
  category: string;
  detail: string;
  date: string;
  rating: number;
  note?: string;
  image?: StaticImageData;
  glyph?: string;
};

type ExperienceImage = ComponentType<{
  src: StaticImageData;
  alt: string;
  fill: boolean;
  sizes: string;
}>;

const demoHistory: Entry[] = [
  { id: "jazz", place: "Violet Note", title: "After-hours jazz", category: "Music", detail: "Lower East Side", date: "2025-06-27", rating: 5, note: "Loved it", image: jazz },
  { id: "hike", place: "Ridge Sunrise", title: "Golden ridge hike", category: "Outdoors", detail: "Cold Spring", date: "2025-06-21", rating: 4, note: "Liked it", image: hike },
  { id: "pottery", place: "Mend Studio", title: "Clay & rosé", category: "Creative", detail: "Williamsburg", date: "2025-06-18", rating: 5, note: "Loved it", image: pottery },
  { id: "supper", place: "Sage Table", title: "Rooftop supper", category: "Food", detail: "Greenpoint", date: "2025-06-14", rating: 4, note: "Liked it", image: rooftop },
  { id: "market", place: "Flea Market", title: "Saturday market", category: "Shopping", detail: "Dumbo", date: "2025-06-09", rating: 3.5, glyph: "Shop" },
  { id: "park", place: "Prospect Park", title: "A walk in the park", category: "Outdoors", detail: "Brooklyn", date: "2025-06-06", rating: 3, glyph: "Outdoors" },
  { id: "gallery", place: "Gallery Walk", title: "First Friday galleries", category: "Creative", detail: "Chelsea", date: "2025-06-02", rating: 3, glyph: "Culture" },
];

const demoFavorites = [...demoHistory].sort((a, b) => b.rating - a.rating).slice(0, 4);
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const glyphs: Partial<Record<PlaceCategory, string>> = {
  restaurant: "Food", cafe: "Food", bar: "Food",
  trail: "Outdoors", park: "Outdoors", viewpoint: "Outdoors",
  museum: "Culture", gallery: "Culture", attraction: "Culture",
  bookstore: "Shop", shop: "Shop", gym: "Activity", climbing: "Activity",
};

function profileEntry(experience: ProfileExperiences["recent"][number]): Entry {
  const category = experience.category === "cafe" ? "Café" : experience.category;
  return {
    id: experience.id,
    place: experience.place_name,
    title: experience.place_name,
    category,
    detail: category,
    date: experience.rated_on,
    rating: experience.rating,
    note: experience.verdict === "recommend" ? "Recommended" : experience.verdict === "avoid" ? "Would skip" : undefined,
    glyph: glyphs[experience.category],
  };
}

export function ProfileExperiencePanels({ data, Image }: {
  data?: ProfileExperiences;
  Image: ExperienceImage;
}) {
  const favorites = data ? data.favorites.map(profileEntry) : demoFavorites;
  const recent = data ? data.recent.map(profileEntry) : demoHistory.slice(0, 4);
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<Entry[]>([]);
  const [nextOffset, setNextOffset] = useState(data?.next_offset ?? null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function loadMore() {
    if (nextOffset === null || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoadState("loading");
    try {
      const page = await profileClient.getExperiences(nextOffset, 16, controller.signal);
      if (controller.signal.aborted) return;
      setHistory((current) => {
        const seen = new Set([...recent, ...current].map((entry) => entry.id));
        return [...current, ...page.recent.filter((entry) => !seen.has(entry.id)).map(profileEntry)];
      });
      setNextOffset(page.next_offset);
      setLoadState("idle");
    } catch {
      if (!controller.signal.aborted) setLoadState("error");
    } finally {
      request.current = null;
    }
  }

  const ratings = expanded ? (data ? [...recent, ...history] : demoHistory) : recent;
  const hasHistory = data ? data.next_offset !== null : demoHistory.length > recent.length;

  return (
    <>
      <section className="profile-experience-panel" aria-labelledby="profile-favorites-heading">
        <div className="profile-experience-heading">
          <div>
            <p className="eyebrow">All-time favorites</p>
            <h3 id="profile-favorites-heading">Top 4 experiences</h3>
          </div>
          <span className="profile-favorite-sparkle" aria-hidden="true">✧</span>
        </div>
        {favorites.length ? (
          <ol className="profile-favorite-grid" role="list">
            {favorites.map((entry, index) => (
              <li key={entry.id}>
                <ExperienceThumbnail entry={entry} Image={Image} rank={index + 1} />
                <p className="profile-favorite-name">{entry.place}</p>
                <p className="profile-favorite-detail">{entry.detail}</p>
              </li>
            ))}
          </ol>
        ) : <p className="profile-experience-message">Your highest-rated experiences will appear here.</p>}
      </section>

      <section className="profile-experience-panel" aria-labelledby="profile-ratings-heading">
        <div className="profile-experience-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h3 id="profile-ratings-heading">{expanded ? "All ratings" : "Last 4 rated"}</h3>
          </div>
          {hasHistory && (
            <button type="button" className="profile-history-button" aria-expanded={expanded} aria-controls="profile-rating-list"
              onClick={() => {
                if (!expanded && history.length === 0) void loadMore();
                setExpanded(!expanded);
              }}>
              {expanded ? "Show less" : "See all"}
            </button>
          )}
        </div>
        {ratings.length ? (
          <ul id="profile-rating-list" className="profile-rating-list" role="list">
            {ratings.map((entry) => (
              <li className="profile-rating-row" key={entry.id}>
                <ExperienceThumbnail entry={entry} Image={Image} />
                <div className="profile-rating-copy">
                  <p className="profile-rating-meta">{entry.category} <span aria-hidden="true">·</span> <time dateTime={entry.date}>{dateFormat.format(new Date(entry.date))}</time></p>
                  <p className="profile-rating-title">{entry.title}</p>
                  {entry.note && <p className="profile-rating-note">{entry.note}</p>}
                </div>
                <span className="profile-rating-score">
                  <span aria-hidden="true">{entry.rating}<small>/5</small></span>
                  <span className="sr-only">{entry.rating} out of 5</span>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="profile-experience-message">Rate a place to start your activity here.</p>}
        {expanded && nextOffset !== null && (
          <div className="profile-history-footer">
            {loadState === "error" && <p role="alert">Couldn’t load more ratings.</p>}
            <button type="button" className="profile-history-button" disabled={loadState === "loading"} onClick={() => void loadMore()}>
              {loadState === "loading" ? "Loading ratings…" : loadState === "error" ? "Try again" : "Load more ratings"}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function ExperienceThumbnail({ entry, Image, rank }: { entry: Entry; Image: ExperienceImage; rank?: number }) {
  return (
    <div className="profile-experience-thumbnail" data-glyph={entry.glyph} aria-hidden="true">
      {entry.image ? <Image src={entry.image} alt="" fill sizes={rank ? "100px" : "46px"} /> : <PlaceGlyph category={entry.glyph} />}
      {rank !== undefined && <span className="profile-favorite-rank">{rank}</span>}
    </div>
  );
}
