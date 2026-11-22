from dataclasses import dataclass, field, replace
from datetime import date
from uuid import UUID

import pytest

from app.dependencies import get_current_user, get_recommendation_repository, get_today
from app.main import app
from app.models import User, domain
from app.recommend.service import RecommendInput
from app.repositories.recommendations import PlaceLogsInput
from app.schemas.recommendations import BBox
from tests.auth_helpers import authenticate
from tests.recommend import fixtures as fx
from tests.recommend.db_seed import seed_fixture

pytestmark = pytest.mark.anyio

AROUND_FIXTURE = "-80,43,-79,44"


@dataclass
class FixtureRecommendationRepository:
    limits: list[int] = field(default_factory=list)

    async def load_input(
        self, viewer: domain.User, bbox: BBox, limit: int, today: date
    ) -> RecommendInput:
        self.limits.append(limit)
        places = tuple(p for p in fx.PLACES if bbox.contains(p.lat, p.lng))
        return replace(fx.BASE_INPUT, viewer=viewer, places=places, limit=limit, today=today)

    async def load_place_logs(self, viewer: domain.User, place_id: str) -> PlaceLogsInput | None:
        place = next((p for p in fx.PLACES if p.id == place_id), None)
        if place is None:
            return None
        return PlaceLogsInput(
            place=place,
            logs=tuple(log for log in fx.LOGS if log.place_id == place_id),
            users=fx.USERS,
            follows=fx.FOLLOWS,
            profiles=fx.PROFILES,
        )


@pytest.fixture
def repository():
    return FixtureRecommendationRepository()


@pytest.fixture
def signed_in(client, repository):
    viewer = User(id=UUID(fx.VIEWER.id), auth0_sub="auth0|viewer", display_name="Viewer")
    app.dependency_overrides[get_current_user] = lambda: viewer
    app.dependency_overrides[get_recommendation_repository] = lambda: repository
    app.dependency_overrides[get_today] = lambda: fx.TODAY
    return client


# GET /api/recommendations


async def test_recommendations_require_sign_in(client):
    response = await client.get("/api/recommendations", params={"bbox": AROUND_FIXTURE})

    assert response.status_code == 401


@pytest.mark.parametrize(
    "bbox",
    ["1,2,3", "a,b,c,d", "-181,0,0,1", "0,-91,1,0", "0,0,1,91", "0,0,0,1", "1,0,0,1", "0,1,1,1"],
)
async def test_recommendations_reject_malformed_bbox(signed_in, bbox):
    response = await signed_in.get("/api/recommendations", params={"bbox": bbox})

    assert response.status_code == 422


async def test_recommendations_require_bbox(signed_in):
    assert (await signed_in.get("/api/recommendations")).status_code == 422


@pytest.mark.parametrize("limit", [0, 101])
async def test_recommendations_reject_out_of_range_limit(signed_in, limit):
    response = await signed_in.get(
        "/api/recommendations", params={"bbox": AROUND_FIXTURE, "limit": limit}
    )

    assert response.status_code == 422


async def test_recommendations_limit_defaults_to_30(signed_in, repository):
    await signed_in.get("/api/recommendations", params={"bbox": AROUND_FIXTURE})

    assert repository.limits == [30]


async def test_recommendations_return_items_with_logs_and_authors(signed_in):
    response = await signed_in.get("/api/recommendations", params={"bbox": AROUND_FIXTURE})

    assert response.status_code == 200
    items = response.json()["items"]
    assert [(i["place"]["id"], i["kind"]) for i in items[:4]] == [
        ("p_01", "friend"),
        ("p_02", "similar_taste"),
        ("p_10", "similar_taste"),
        ("p_03", "friend"),
    ]
    first = items[0]
    assert first["place"] == {
        "id": "p_01",
        "name": "Place 1",
        "lat": pytest.approx(43.61),
        "lng": -79.4,
        "category": "trail",
    }
    assert first["score"] == pytest.approx(3.903, abs=1e-3)
    assert first["logs"][0] == {
        "experience_id": "e_02",
        "author": {"id": fx.LEO.id, "display_name": "Leo", "avatar_url": None},
        "relation": "following",
        "rating": 4.5,
        "verdict": "recommend",
        "review": None,
        "photo_urls": [],
        "visited_on": "2026-10-05",
    }
    assert {i["kind"] for i in items[4:]} == {"explore"}


async def test_recommendations_only_cover_places_inside_the_bbox(signed_in):
    response = await signed_in.get("/api/recommendations", params={"bbox": "-80,43.615,-79,44"})

    assert "p_01" not in {i["place"]["id"] for i in response.json()["items"]}


async def test_recommendations_are_not_cached(signed_in):
    response = await signed_in.get("/api/recommendations", params={"bbox": AROUND_FIXTURE})

    assert response.headers["cache-control"] == "no-store"


async def test_recommendations_for_a_real_session_with_no_data_are_empty(client, identity_provider):
    await authenticate(client, identity_provider)

    response = await client.get("/api/recommendations", params={"bbox": AROUND_FIXTURE})

    assert response.status_code == 200
    assert response.json() == {"items": []}


# GET /api/places/{place_id}/logs


async def test_place_logs_require_sign_in(client):
    assert (await client.get("/api/places/p_01/logs")).status_code == 401


async def test_place_logs_unknown_place_is_404(signed_in):
    assert (await signed_in.get("/api/places/p_zz/logs")).status_code == 404


async def test_place_logs_put_liked_logs_first(signed_in):
    response = await signed_in.get("/api/places/p_04/logs")

    assert response.status_code == 200
    body = response.json()
    assert body["place"]["id"] == "p_04"
    assert [(log["experience_id"], log["relation"]) for log in body["logs"]] == [
        ("e_11", "similar_taste"),
        ("e_10", "following"),
    ]
    assert response.headers["cache-control"] == "no-store"


async def test_place_logs_return_every_log_in_relation_order(signed_in):
    response = await signed_in.get("/api/places/p_01/logs")

    ids = [log["experience_id"] for log in response.json()["logs"]]
    assert ids == ["e_02", "e_01", "e_03", "e_04", "e_05"]


async def test_place_logs_for_a_real_session_with_no_data_are_404(client, identity_provider):
    await authenticate(client, identity_provider)

    assert (await client.get("/api/places/p_01/logs")).status_code == 404


async def test_recommendations_end_to_end_from_the_database(
    client, identity_provider, database_factory
):
    await authenticate(client, identity_provider)
    viewer_id = UUID((await client.get("/api/auth/me")).json()["user"]["id"])
    async with database_factory() as session:
        ids = await seed_fixture(session, viewer_id=viewer_id)
    fixture_id = {str(db_id): fid for fid, db_id in ids.items()}

    response = await client.get("/api/recommendations", params={"bbox": AROUND_FIXTURE})

    items = response.json()["items"]
    assert [(fixture_id[i["place"]["id"]], i["kind"]) for i in items[:4]] == [
        ("p_01", "friend"),
        ("p_02", "similar_taste"),
        ("p_10", "similar_taste"),
        ("p_03", "friend"),
    ]
    assert sorted(fixture_id[i["place"]["id"]] for i in items[4:]) == ["p_05", "p_06"]
    assert [fixture_id[log["experience_id"]] for log in items[0]["logs"]] == [
        "e_02",
        "e_01",
        "e_03",
    ]

    place_logs = await client.get(f"/api/places/{ids['p_04']}/logs")
    assert [fixture_id[log["experience_id"]] for log in place_logs.json()["logs"]] == [
        "e_11",
        "e_10",
    ]
