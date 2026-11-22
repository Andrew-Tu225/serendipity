import { Icon } from "@/components/ui/icon";
import type { Coordinates } from "@/types/places";

export function ExperienceLocationField({ name, address, point, google, onSelect }: {
  name?: string;
  address?: string;
  point?: Coordinates;
  google?: boolean;
  onSelect: () => void;
}) {
  const coordinates = point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : "";
  const selected = Boolean(name || point);

  return (
    <section className="experience-location" aria-label="Location">
      <h3>Location</h3>
      <p className="experience-location-summary">
        {selected
          ? address || (name ? "Selected on the map" : `Map pin · ${coordinates}`)
          : "Search for a place or select a location on the map"}
        {google && <span>Google Maps</span>}
      </p>
      <button className="experience-location-action" type="button" onClick={onSelect}>
        <Icon name="pin" size={18} />
        {selected ? "Change location" : "Select location"}
      </button>
      <label>Business name
        <input readOnly value={name ?? ""} placeholder={point ? "Name this place below" : "Filled in from the map"} />
      </label>
    </section>
  );
}
