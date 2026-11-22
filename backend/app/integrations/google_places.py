from urllib.parse import quote

import httpx

AUTOCOMPLETE_FIELDS = (
    "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat"
)
DETAIL_FIELDS = "id,displayName,formattedAddress,location,viewport,googleMapsUri,attributions"
NEARBY_FIELDS = ",".join(f"places.{field}" for field in (DETAIL_FIELDS + ",types").split(","))
# Experience destinations, rather than utilities, offices, or residential addresses.
EXPERIENCE_TYPES = [
    "restaurant",
    "cafe",
    "bakery",
    "bar",
    "park",
    "hiking_area",
    "tourist_attraction",
    "museum",
    "art_gallery",
    "performing_arts_theater",
    "movie_theater",
    "library",
    "gym",
    "sports_complex",
    "bowling_alley",
    "amusement_park",
    "zoo",
    "aquarium",
    "book_store",
    "clothing_store",
    "shopping_mall",
    "spa",
]


class GooglePlacesClient:
    def __init__(self, api_key: str, transport: httpx.AsyncBaseTransport | None = None):
        self.api_key = api_key
        self.transport = transport

    async def request(self, method: str, path: str, fields: str, **kwargs) -> dict:
        # Fixed origin and encoded IDs prevent client-controlled provider URLs.
        async with httpx.AsyncClient(
            base_url="https://places.googleapis.com",
            timeout=10,
            transport=self.transport,
            headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": fields},
        ) as client:
            response = await client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()

    async def autocomplete(self, query: str, session_token: str, center: dict | None) -> dict:
        body = {"input": query, "sessionToken": session_token, "languageCode": "en"}
        if center:
            body["locationBias"] = {"circle": {"center": center, "radius": 25000.0}}
        return await self.request("POST", "/v1/places:autocomplete", AUTOCOMPLETE_FIELDS, json=body)

    async def find_fixture(self, name: str) -> list[dict]:
        data = await self.request(
            "POST",
            "/v1/places:searchText",
            "places.id,places.displayName,places.location",
            json={
                "textQuery": f"{name}, London, Ontario, Canada",
                "languageCode": "en",
                "pageSize": 5,
            },
        )
        return data.get("places", [])

    async def details(self, place_id: str, session_token: str) -> dict:
        return await self.request(
            "GET",
            f"/v1/places/{quote(place_id, safe='')}",
            DETAIL_FIELDS,
            params={"sessionToken": session_token, "languageCode": "en"},
        )

    async def nearby(self, center: dict, radius: float) -> dict:
        return await self.request(
            "POST",
            "/v1/places:searchNearby",
            NEARBY_FIELDS,
            json={
                "includedTypes": EXPERIENCE_TYPES,
                "maxResultCount": 20,
                "rankPreference": "DISTANCE",
                "languageCode": "en",
                "locationRestriction": {"circle": {"center": center, "radius": radius}},
            },
        )

    async def photo(self, place_id: str) -> dict | None:
        data = await self.request("GET", f"/v1/places/{quote(place_id, safe='')}", "photos")
        photos = data.get("photos", [])
        if not photos:
            return None
        photo = photos[0]
        name = photo["name"]
        prefix = f"places/{place_id}/photos/"
        if not name.startswith(prefix) or not name[len(prefix) :] or "/" in name[len(prefix) :]:
            raise ValueError("Invalid photo resource")
        media = await self.request(
            "GET",
            f"/v1/{quote(name, safe='/')}/media",
            "",
            params={"maxWidthPx": 800, "skipHttpRedirect": "true"},
        )
        return {**photo, "url": media["photoUri"]}
