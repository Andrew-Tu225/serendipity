import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ExperienceLocationField } from "./experience-location-field";
import { localToday } from "./local-date";

const criteria: Record<string, string[]> = {
  Restaurants: ["Flavor", "Service", "Atmosphere"],
  Hikes: ["Scenery", "Physical effort", "Difficulty"],
  Creative: ["Creativity", "Guidance", "Hands-on"],
  Nightlife: ["Energy", "Music", "Crowd"],
  Wellness: ["Relaxation", "Care", "Value"],
  Other: ["Novelty", "Organization", "Value"],
};

const steps = ["category", "sentiment", "name", "companions", "date", "media", "labels", "favorites", "notes", "ratings"] as const;
const titles = {
  category: "Add to a list",
  sentiment: "How was it?",
  name: "What did you do?",
  companions: "Who did you go with?",
  date: "Date visited",
  media: "Add photos or video",
  labels: "Labels",
  favorites: "Favorite parts",
  notes: "Notes",
  ratings: "Rate this experience",
};

export function PreviewExperienceForm({ location, onSelectLocation, onShare }: {
  location: { name: string; address: string } | null;
  onSelectLocation: () => void;
  onShare: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [name, setName] = useState("");
  const [companions, setCompanions] = useState("");
  const [date, setDate] = useState("");
  const [media, setMedia] = useState<{ url: string; type: string; name: string } | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [favorites, setFavorites] = useState("");
  const [notes, setNotes] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index];
  const next = () => setIndex((position) => Math.min(position + 1, steps.length - 1));
  useEffect(() => { if (location) heading.current?.focus(); }, [index, location]);
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url); }, [media]);

  const validDate = Boolean(date && date <= localToday());
  const ready = Boolean(category && sentiment && name.trim() && validDate && Object.keys(ratings).length === criteria[category].length);
  const required = step === "name" || step === "date";
  const hasAnswer = {
    companions: Boolean(companions), media: Boolean(media), labels: labels.length > 0,
    favorites: Boolean(favorites.trim()), notes: Boolean(notes.trim()),
  };
  const optionalAnswered = step in hasAnswer && hasAnswer[step as keyof typeof hasAnswer];

  function addLabel() {
    const label = labelInput.trim().replace(/^#/, "");
    if (label && !labels.includes(label)) setLabels((items) => [...items, label]);
    setLabelInput("");
  }

  return (
    <>
      <h2>Add an experience</h2>
      <ExperienceLocationField name={location?.name} address={location?.address} google={Boolean(location)} onSelect={onSelectLocation} />
      {location && <section className="experience-question" aria-labelledby="preview-question">
        <h3 id="preview-question" ref={heading} tabIndex={-1}>{titles[step]}</h3>
        {step === "category" && <div className="category-options">
          {Object.keys(criteria).map((item) => (
            <button key={item} type="button" className={category === item ? "selected" : ""} onClick={() => {
              if (category !== item) setRatings({});
              setCategory(item);
              next();
            }}>{item}</button>
          ))}
        </div>}
        {step === "sentiment" && <div className="sentiment-options">
          {([
            { text: "I liked it", color: "green", icon: "heart" },
            { text: "It was okay", color: "yellow", icon: null },
            { text: "I didn’t like it", color: "red", icon: "close" },
          ] as const).map(({ text, color, icon }) => (
            <button key={text} type="button" className={sentiment === text ? "selected" : ""} onClick={() => { setSentiment(text); next(); }}>
              <i className={color}>{icon ? <Icon name={icon} size={19} /> : "—"}</i><span>{text}</span>
            </button>
          ))}
        </div>}
        {step === "name" && <input aria-label={titles.name} value={name} maxLength={120} placeholder="e.g. Sunset pasta class" onChange={(event) => setName(event.target.value)} />}
        {step === "companions" && <select aria-label={titles.companions} value={companions} onChange={(event) => setCompanions(event.target.value)}>
          <option value="">Select people</option>
          {["Elena & James", "Alex", "My partner", "Family", "Went solo"].map((person) => <option key={person}>{person}</option>)}
        </select>}
        {step === "date" && <input aria-label={titles.date} type="date" value={date} max={localToday()} onChange={(event) => setDate(event.target.value)} />}
        {step === "media" && <label className="media-picker">
          <input type="file" aria-label={titles.media} accept="image/*,video/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setMedia({ url: URL.createObjectURL(file), type: file.type, name: file.name });
          }} />
          {media ? <div className="media-preview">
            {media.type.startsWith("video/") ? <video src={media.url} controls /> : <img src={media.url} alt="Selected upload preview" />}
            <span>{media.name}</span>
          </div> : <div className="media-empty"><span><Icon name="plus" size={23} /></span><strong>Choose a file</strong></div>}
        </label>}
        {step === "labels" && <>
          <div className="labels-input">
            <input aria-label="New label" value={labelInput} onChange={(event) => setLabelInput(event.target.value)} placeholder="Add a label"
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLabel(); } }} />
            <button type="button" aria-label="Add label" onClick={addLabel}><Icon name="plus" size={16} /></button>
          </div>
          <div className="added-labels">
            {labels.map((label) => <button key={label} type="button" aria-label={`Remove ${label}`}
              onClick={() => setLabels((items) => items.filter((item) => item !== label))}>#{label} <Icon name="close" size={10} /></button>)}
          </div>
        </>}
        {step === "favorites" && <textarea aria-label={titles.favorites} value={favorites} onChange={(event) => setFavorites(event.target.value)} rows={2} />}
        {step === "notes" && <textarea aria-label={titles.notes} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />}
        {step === "ratings" && <div className="rating-block">
          {criteria[category].map((criterion) => <div className="scale-row" key={criterion}>
            <span>{criterion}</span>
            <div role="group" aria-label={`${criterion} rating`}>
              {[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-pressed={ratings[criterion] === rating}
                className={rating <= (ratings[criterion] ?? 0) ? "selected" : ""}
                onClick={() => setRatings((current) => ({ ...current, [criterion]: rating }))}>{rating}</button>)}
            </div>
          </div>)}
        </div>}
        <div className="experience-step-actions">
          {index > 0 && <button type="button" className="experience-step-back" onClick={() => setIndex((position) => position - 1)}>Back</button>}
          {step === "ratings" ? <button type="button" className="primary-button" disabled={!ready} onClick={onShare}>Share experience</button>
            : step !== "category" && step !== "sentiment" && <button type="button" className="primary-button"
              disabled={step === "name" ? !name.trim() : step === "date" && !validDate}
              onClick={next}>{required || optionalAnswered ? "Continue" : "Skip"}</button>}
        </div>
      </section>}
    </>
  );
}
