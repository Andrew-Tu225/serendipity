import { defaultCharacter, type CharacterAppearance } from "@/types/character";
import { CharacterFigure } from "./character-figure";

export function CharacterPortrait({ identity, appearance, size }: {
  identity: string;
  appearance?: CharacterAppearance | null;
  size?: number;
}) {
  return (
    <span className="character-portrait" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <CharacterFigure options={appearance ?? defaultCharacter(identity)} portrait />
    </span>
  );
}
