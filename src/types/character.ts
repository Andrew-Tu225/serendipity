export interface CharacterAppearance {
  features: "feminine" | "masculine";
  hairStyle: "short" | "wavy" | "curly" | "bun";
  hairColor: string;
  skinTone: string;
  shirt: string;
  pants: string;
  shoes: string;
  hat: "none" | "cap" | "beanie";
}

export const hairStyles = ["short", "wavy", "curly", "bun"] as const;
export const hairColors = ["#211d20", "#5a392c", "#9a6038", "#e1b36d", "#a75b75", "#74558f"];
export const skinTones = ["#f1c3a4", "#dca985", "#c38963", "#a46b4e", "#80513d", "#624132"];
export const shirtColors = ["#8664a0", "#d5747f", "#4e8379", "#d79d4f", "#517099", "#332e38"];

export const miaCharacter: CharacterAppearance = {
  features: "feminine",
  hairStyle: "wavy",
  hairColor: "#5a392c",
  skinTone: "#dca985",
  shirt: "#8664a0",
  pants: "#4d526b",
  shoes: "#eee8f2",
  hat: "none",
};

export function defaultCharacter(identity: string): CharacterAppearance {
  let seed = 2166136261;
  for (const character of identity) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  }
  return {
    ...miaCharacter,
    features: seed & 1 ? "feminine" : "masculine",
    hairStyle: hairStyles[(seed >>> 1) % hairStyles.length],
    hairColor: hairColors[(seed >>> 5) % hairColors.length],
    skinTone: skinTones[(seed >>> 10) % skinTones.length],
    shirt: shirtColors[(seed >>> 15) % shirtColors.length],
  };
}
