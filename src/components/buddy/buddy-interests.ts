const interestList = new Intl.ListFormat("en", { type: "conjunction" });

export function describeBuddyInterests(interests: readonly string[]) {
  if (!interests.length) return "Still finding their favorite places.";
  return `Enjoys ${interestList.format(interests.map((interest) => interest.toLowerCase()))}.`;
}
