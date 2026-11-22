export interface ListedPlace {
  id?: string;
  name: string;
  location: string;
  mapUrl?: string;
}

export interface DemoPlaceList {
  id: string;
  name: string;
  icon: "heart" | "map" | "bookmark" | "pin";
  places: ListedPlace[];
}

export function saveDemoList(lists: DemoPlaceList[], list: DemoPlaceList) {
  return lists.some((item) => item.id === list.id)
    ? lists.map((item) => item.id === list.id ? list : item)
    : [list, ...lists];
}

const places = {
  violet: { name: "Violet Note", location: "Lower East Side, Manhattan" },
  mend: { name: "Mend Studio", location: "Williamsburg, Brooklyn" },
  ridge: { name: "Ridge Sunrise", location: "Cold Spring, NY" },
  sage: { name: "Sage Table", location: "Greenpoint, Brooklyn" },
  willow: { name: "Willow Wine Room", location: "Fort Greene, Brooklyn" },
  clay: { name: "Corner Clay House", location: "Long Island City, Queens" },
  field: { name: "Fieldwork Gallery", location: "Beacon, NY" },
  orchard: { name: "Orchard House Café", location: "Tarrytown, NY" },
  iris: { name: "Iris Kitchen", location: "Cobble Hill, Brooklyn" },
  market: { name: "Market Lane Bakery", location: "DUMBO, Brooklyn" },
  park: { name: "Prospect Park", location: "Brooklyn, NY" },
  waterfront: { name: "Gantry Plaza State Park", location: "Long Island City, Queens" },
  grove: { name: "Juniper Books", location: "Park Slope, Brooklyn" },
  porch: { name: "Porchlight Café", location: "Astoria, Queens" },
};

export const demoPlaceLists: DemoPlaceList[] = [
  { id: "date-night", name: "Date-night spots", icon: "heart", places: [places.violet, places.sage, places.willow, places.iris] },
  { id: "train-ride", name: "Worth the train ride", icon: "map", places: [places.ridge, places.field, places.orchard] },
  { id: "little-dinners", name: "Perfect little dinners", icon: "bookmark", places: [places.sage, places.iris, places.willow] },
  { id: "weekend-outside", name: "Weekend outside", icon: "pin", places: [places.park, places.ridge, places.waterfront] },
  { id: "slow-mornings", name: "Slow mornings", icon: "heart", places: [places.porch, places.market, places.grove] },
  { id: "make-something", name: "Make something", icon: "bookmark", places: [places.mend, places.clay] },
  { id: "gallery-days", name: "Gallery days", icon: "map", places: [places.field, places.clay] },
  { id: "waterfront", name: "By the water", icon: "pin", places: [places.waterfront, places.market] },
  { id: "rainy-day", name: "Rainy-day plans", icon: "bookmark", places: [places.grove, places.violet, places.mend] },
  { id: "coffee-stops", name: "Coffee stops", icon: "heart", places: [places.porch, places.orchard] },
  { id: "show-a-friend", name: "Show a friend", icon: "map", places: [places.violet, places.park, places.sage] },
  { id: "afternoon-away", name: "An afternoon away", icon: "pin", places: [places.orchard, places.field] },
];
