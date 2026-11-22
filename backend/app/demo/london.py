from dataclasses import dataclass
from datetime import date, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5

from app.models import domain


def demo_id(key: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"serendipity:demo:london:{key}")


@dataclass(frozen=True)
class DemoPlace:
    slug: str
    name: str
    lat: float
    lng: float
    category: domain.Category


# Approximate, authored demo pin positions, not Google Places data or navigation coordinates.
PLACES = (
    DemoPlace(
        "covent-market", "Covent Garden Market", 42.9826, -81.2493, domain.Category.ATTRACTION
    ),
    DemoPlace("early-bird", "The Early Bird", 42.9822, -81.2499, domain.Category.RESTAURANT),
    DemoPlace("black-walnut", "Black Walnut Bakery Cafe", 42.9975, -81.2513, domain.Category.CAFE),
    DemoPlace("thaifoon", "Thaifoon", 42.9834, -81.2501, domain.Category.RESTAURANT),
    DemoPlace("the-mule", "The Mule London", 42.9883, -81.2501, domain.Category.RESTAURANT),
    DemoPlace("milos", "Milos Craft Beer Emporium", 42.9844, -81.2507, domain.Category.BAR),
    DemoPlace(
        "tanakaya", "Tanakaya Japanese Restaurant", 42.9824, -81.2491, domain.Category.RESTAURANT
    ),
    DemoPlace("market-cafe", "Market Cafe", 42.9827, -81.2490, domain.Category.CAFE),
    DemoPlace("hasbeans", "Hasbeans Coffee", 42.9825, -81.2496, domain.Category.CAFE),
    DemoPlace("tea-haus", "The Tea Haus", 42.9828, -81.2495, domain.Category.CAFE),
    DemoPlace("bear-frankies", "Bear & Frankie's", 42.9823, -81.2494, domain.Category.RESTAURANT),
    DemoPlace("museum-london", "Museum London", 42.9827, -81.2550, domain.Category.MUSEUM),
    DemoPlace("eldon-house", "Eldon House", 42.9866, -81.2560, domain.Category.MUSEUM),
    DemoPlace("grand-theatre", "Grand Theatre", 42.9873, -81.2503, domain.Category.ATTRACTION),
    DemoPlace(
        "central-library",
        "London Public Library - Central",
        42.9838,
        -81.2453,
        domain.Category.OTHER,
    ),
    DemoPlace("victoria-park", "Victoria Park", 42.9905, -81.2490, domain.Category.PARK),
    DemoPlace("ivey-park", "Ivey Park", 42.9810, -81.2548, domain.Category.PARK),
    DemoPlace("harris-park", "Harris Park", 42.9878, -81.2570, domain.Category.PARK),
    DemoPlace("gibbons-park", "Gibbons Park", 43.0048, -81.2640, domain.Category.PARK),
    DemoPlace("springbank-park", "Springbank Park", 42.9595, -81.3100, domain.Category.PARK),
    DemoPlace("thames-park", "Thames Park", 42.9754, -81.2486, domain.Category.PARK),
    DemoPlace("forks-thames", "Forks of the Thames", 42.9823, -81.2564, domain.Category.VIEWPOINT),
    DemoPlace(
        "blackfriars-bridge", "Blackfriars Bridge", 42.9927, -81.2599, domain.Category.VIEWPOINT
    ),
    DemoPlace("dundas-place", "Dundas Place", 42.9843, -81.2480, domain.Category.ATTRACTION),
)
PEOPLE = (
    "Elena",
    "James",
    "Alex",
    "Maya",
    "Noah",
    "Priya",
    "Olivia",
    "Liam",
    "Sofia",
    "Ethan",
    "Amara",
    "Lucas",
    "Zoe",
    "Owen",
    "Aisha",
    "Leo",
    "Isabella",
    "Arjun",
    "Chloe",
    "Mateo",
)
REVIEW_NOTES = {
    "food": (
        "A relaxed lunch stop; I'd leave time to explore the neighborhood afterward.",
        "Good for a casual catch-up. I would choose a quieter time for a long conversation.",
        "A fun place to try something new on a weekend wander.",
    ),
    "outdoors": (
        "A lovely spot for a slow walk and a little time outdoors.",
        "I liked stopping here on a longer riverside walk.",
        "Worth adding to a sunny afternoon route through the city.",
    ),
    "culture": (
        "An interesting stop for an afternoon exploring London.",
        "I would leave more time to look around on my next visit.",
        "A nice change of pace and an easy addition to a downtown outing.",
    ),
}


def experiences(today: date) -> list[domain.Experience]:
    logs = []
    for index, place in enumerate(PLACES):
        family = (
            "food"
            if place.category
            in {
                domain.Category.RESTAURANT,
                domain.Category.CAFE,
                domain.Category.BAR,
            }
            else "outdoors"
            if place.category
            in {
                domain.Category.PARK,
                domain.Category.VIEWPOINT,
            }
            else "culture"
        )
        # Preserve the original six authors' IDs and visits on already-seeded databases.
        reviewers = [((index + offset) % 6, offset) for offset in range(4)]
        # Each additional user has five visits spread across London and place categories.
        reviewers.extend(
            (person, 4 + person)
            for person in range(6, len(PEOPLE))
            if index in {(person * 3 + visit * 5) % len(PLACES) for visit in range(5)}
        )
        for person, offset in reviewers:
            rating = (2, 2.5, 3, 3.5, 4, 4.5, 5)[(index * 3 + offset * 2) % 7]
            verdict = (
                domain.Verdict.RECOMMEND
                if rating >= 4
                else domain.Verdict.AVOID
                if rating <= 2.5
                else domain.Verdict.NEUTRAL
            )
            note = REVIEW_NOTES[family][(index + offset) % 3]
            if verdict is domain.Verdict.AVOID:
                note = "Not my favorite stop, but someone with different tastes might enjoy it."
            logs.append(
                domain.Experience(
                    id=str(demo_id(f"experience:{place.slug}:{person}")),
                    user_id=str(demo_id(f"user:{PEOPLE[person]}")),
                    place_id=str(demo_id(f"place:{place.slug}")),
                    rating=rating,
                    verdict=verdict,
                    review=f"[Mock review] {note}",
                    visited_on=today - timedelta(days=1 + (index + offset * 5) % 30),
                )
            )
        if index % 5 == 0:
            # An older repeat visit demonstrates latest-per-author rating summaries.
            logs.append(
                domain.Experience(
                    id=str(demo_id(f"experience:{place.slug}:older")),
                    user_id=str(demo_id(f"user:{PEOPLE[index % 6]}")),
                    place_id=str(demo_id(f"place:{place.slug}")),
                    rating=3,
                    verdict=domain.Verdict.NEUTRAL,
                    review="[Mock review] An earlier visit; I came back to try this place again.",
                    visited_on=today - timedelta(days=60),
                )
            )
    return logs
