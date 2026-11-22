from datetime import date

import httpx
import pytest
from sqlalchemy import select, update

from app.demo.london import PLACES, demo_id
from app.integrations.google_places import GooglePlacesClient
from app.models import Place
from app.services.demo_data import DemoDataService
from app.services.fixture_places import FixturePlacesService

pytestmark = pytest.mark.anyio


async def test_links_only_unambiguous_nearby_exact_names(database_factory, monkeypatch):
    fixtures = PLACES[:3]
    monkeypatch.setattr("app.services.fixture_places.PLACES", fixtures)
    answers = [
        [
            {
                "id": "market",
                "displayName": {"text": fixtures[0].name},
                "location": {"latitude": fixtures[0].lat, "longitude": fixtures[0].lng},
            }
        ],
        [
            {
                "id": "far-away",
                "displayName": {"text": fixtures[1].name},
                "location": {"latitude": 48, "longitude": -81},
            }
        ],
        [
            {
                "id": str(i),
                "displayName": {"text": fixtures[2].name},
                "location": {"latitude": fixtures[2].lat, "longitude": fixtures[2].lng},
            }
            for i in range(2)
        ],
    ]

    def handle(request):
        assert request.url.path == "/v1/places:searchText"
        return httpx.Response(200, json={"places": answers.pop(0)})

    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        await session.execute(update(Place).values(google_place_id=None))
        await session.commit()
        result = await FixturePlacesService(
            session, GooglePlacesClient("key", httpx.MockTransport(handle))
        ).link()
        assert result == {
            "linked": [fixtures[0].slug],
            "unresolved": [p.slug for p in fixtures[1:]],
            "conflicts": [],
        }
        assert (
            await session.get(Place, demo_id(f"place:{fixtures[0].slug}"))
        ).google_place_id == "market"


async def test_link_conflicts_preserve_existing_place(database_factory, monkeypatch):
    fixture = PLACES[0]
    monkeypatch.setattr("app.services.fixture_places.PLACES", (fixture,))
    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        await session.execute(update(Place).values(google_place_id=None))
        await session.commit()
        existing = Place(name="Existing", lat=43, lng=-81, category="cafe", google_place_id="taken")
        session.add(existing)
        await session.commit()
        provider = GooglePlacesClient(
            "key",
            httpx.MockTransport(
                lambda _: httpx.Response(
                    200,
                    json={
                        "places": [
                            {
                                "id": "taken",
                                "displayName": {"text": fixture.name},
                                "location": {"latitude": fixture.lat, "longitude": fixture.lng},
                            }
                        ]
                    },
                )
            ),
        )
        result = await FixturePlacesService(session, provider).link()
        assert result["conflicts"] == [fixture.slug]
        assert (await session.get(Place, demo_id(f"place:{fixture.slug}"))).google_place_id is None
        assert (
            await session.scalar(select(Place.id).where(Place.google_place_id == "taken"))
            == existing.id
        )


async def test_verified_seed_links_do_not_repeat_provider_searches(database_factory):
    def unexpected_request(request):
        raise AssertionError("Already-linked fixtures must not trigger paid searches")

    async with database_factory() as session:
        await DemoDataService(session).seed_london(date.today())
        result = await FixturePlacesService(
            session, GooglePlacesClient("key", httpx.MockTransport(unexpected_request))
        ).link()
        assert result == {"linked": [p.slug for p in PLACES], "unresolved": [], "conflicts": []}
