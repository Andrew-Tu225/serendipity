import math
from collections import deque
from time import monotonic
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.integrations.google_places import GooglePlacesClient
from app.schemas.places import (
    AutocompleteQuery,
    AutocompleteResponse,
    PlaceAttribution,
    PlaceDetails,
    PlaceSuggestion,
)


class PlacesRateLimiter:
    """Bounded, process-wide sliding windows; intentionally independent of proxy IP headers."""

    def __init__(self):
        self.requests: dict[str, deque[float]] = {"autocomplete": deque(), "details": deque()}

    def check(self, operation: str):
        now = monotonic()
        window = self.requests[operation]
        while window and window[0] <= now - 60:
            window.popleft()
        limit = 120 if operation == "autocomplete" else 60
        if len(window) >= limit:
            raise HTTPException(
                429,
                "Place search is busy. Please try again shortly.",
                headers={"Retry-After": str(max(1, math.ceil(window[0] + 60 - now)))},
            )
        window.append(now)


class PlacesService:
    def __init__(self, provider: GooglePlacesClient, limiter: PlacesRateLimiter):
        self.provider = provider
        self.limiter = limiter

    def prepare(self, operation: str):
        if not self.provider.api_key:
            raise HTTPException(503, "Place search is not configured")
        self.limiter.check(operation)

    async def autocomplete(self, query: AutocompleteQuery) -> AutocompleteResponse:
        self.prepare("autocomplete")
        center = (
            {"latitude": query.latitude, "longitude": query.longitude}
            if query.latitude is not None
            else None
        )
        try:
            data = await self.provider.autocomplete(query.query, str(query.session_token), center)
            suggestions = []
            for item in data.get("suggestions", [])[:5]:
                prediction = item.get("placePrediction")
                if not prediction:
                    continue
                text = prediction["structuredFormat"]
                suggestions.append(
                    PlaceSuggestion(
                        place_id=prediction["placeId"],
                        primary_text=text["mainText"]["text"],
                        secondary_text=text.get("secondaryText", {}).get("text", ""),
                    )
                )
            return AutocompleteResponse(suggestions=suggestions)
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise HTTPException(503, "Place search is unavailable. Please try again.") from error

    async def details(self, place_id: str, session_token: UUID) -> PlaceDetails:
        self.prepare("details")
        try:
            data = await self.provider.details(place_id, str(session_token))
            return PlaceDetails(
                place_id=data["id"],
                display_name=data["displayName"]["text"],
                address=data.get("formattedAddress", ""),
                location=data["location"],
                viewport=data.get("viewport"),
                google_maps_uri=data["googleMapsUri"],
                attributions=[
                    PlaceAttribution(
                        provider=item["provider"], provider_uri=item.get("providerUri")
                    )
                    for item in data.get("attributions", [])
                ],
            )
        except (httpx.HTTPError, ValidationError, ValueError, KeyError, TypeError) as error:
            raise HTTPException(503, "Place details are unavailable. Please try again.") from error
