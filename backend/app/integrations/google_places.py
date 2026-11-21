from urllib.parse import quote

import httpx

AUTOCOMPLETE_FIELDS = (
    "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat"
)
DETAIL_FIELDS = "id,displayName,formattedAddress,location,viewport,googleMapsUri,attributions"


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

    async def details(self, place_id: str, session_token: str) -> dict:
        return await self.request(
            "GET",
            f"/v1/places/{quote(place_id, safe='')}",
            DETAIL_FIELDS,
            params={"sessionToken": session_token, "languageCode": "en"},
        )
