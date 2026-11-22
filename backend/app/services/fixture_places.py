"""Resolve authored fixture destinations conservatively; retain provider IDs only."""

import math
import unicodedata

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.demo.london import PLACES, demo_id
from app.integrations.google_places import GooglePlacesClient
from app.repositories.demo_data import DemoDataRepository


def normalized_name(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", value).casefold()
        if character.isalnum()
    )


class FixturePlacesService:
    def __init__(self, session: AsyncSession, provider: GooglePlacesClient):
        self.session = session
        self.repository = DemoDataRepository(session)
        self.provider = provider

    async def link(self) -> dict[str, list[str]]:
        if not self.provider.api_key:
            raise ValueError("Set BACKEND_API_KEY_GOOGLE before linking places")
        result: dict[str, list[str]] = {"linked": [], "unresolved": [], "conflicts": []}
        try:
            for place in PLACES:
                candidates = await self.provider.find_fixture(place.name)
                matches = []
                for candidate in candidates:
                    if normalized_name(candidate["displayName"]["text"]) != normalized_name(
                        place.name
                    ):
                        continue
                    location = candidate["location"]
                    # Authored pins are approximate. Require the same name within 750 metres.
                    distance = math.hypot(
                        (location["latitude"] - place.lat) * 111_320,
                        (location["longitude"] - place.lng)
                        * 111_320
                        * math.cos(math.radians(place.lat)),
                    )
                    if distance <= 750:
                        matches.append(candidate["id"])
                if len(set(matches)) != 1:
                    result["unresolved"].append(place.slug)
                elif await self.repository.link_place(demo_id(f"place:{place.slug}"), matches[0]):
                    result["linked"].append(place.slug)
                else:
                    result["conflicts"].append(place.slug)
            await self.session.commit()
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            await self.session.rollback()
            raise ValueError(
                "Place linking failed; provider IDs were not changed. "
                "Check the Google key and network."
            ) from None
        return result
