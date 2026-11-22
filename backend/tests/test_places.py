from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.places import get_places_service
from app.integrations.google_places import (
    AUTOCOMPLETE_FIELDS,
    DETAIL_FIELDS,
    EXPERIENCE_TYPES,
    NEARBY_FIELDS,
    GooglePlacesClient,
)
from app.main import app
from app.services.places import PlacesRateLimiter, PlacesService

TOKEN = str(uuid4())
PARAMS = {"query": "  garden  ", "session_token": TOKEN, "latitude": 43.65, "longitude": -79.38}
DETAIL = {
    "id": "test-place",
    "displayName": {"text": "A garden"},
    "formattedAddress": "Toronto",
    "location": {"latitude": 43.65, "longitude": -79.38},
    "viewport": {
        "low": {"latitude": 43.64, "longitude": -79.39},
        "high": {"latitude": 43.66, "longitude": -79.37},
    },
    "googleMapsUri": "https://maps.google.com/?cid=123",
    "attributions": [{"provider": "Provider", "providerUri": "https://example.com"}],
}


@pytest.fixture
def places_client():
    requests = []
    state = {"status": 200, "timeout": False, "body": None}

    def handle(request):
        requests.append(request)
        if state["timeout"]:
            raise httpx.ReadTimeout("private-provider-error", request=request)
        body = state["body"]
        if body is None:
            body = (
                {
                    "suggestions": [
                        {
                            "placePrediction": {
                                "placeId": "test-place",
                                "structuredFormat": {"mainText": {"text": "A garden"}},
                            }
                        }
                    ]
                }
                if request.url.path.endswith("autocomplete")
                else DETAIL
            )
        return httpx.Response(state["status"], json=body)

    provider = GooglePlacesClient("private-google-key", httpx.MockTransport(handle))
    limiter = PlacesRateLimiter()
    app.dependency_overrides[get_places_service] = lambda: PlacesService(provider, limiter)
    with TestClient(app) as client:
        yield client, requests, state, limiter, provider
    app.dependency_overrides.pop(get_places_service, None)


def test_public_autocomplete_bias_fields_and_session(places_client):
    import json

    client, requests, *_ = places_client
    response = client.get("/api/places/autocomplete", params=PARAMS)
    assert response.status_code == 200
    assert response.json() == {
        "suggestions": [
            {
                "place_id": "test-place",
                "primary_text": "A garden",
                "secondary_text": "",
            }
        ]
    }
    assert response.headers["cache-control"] == "no-store"
    request = requests[0]
    assert request.url.host == "places.googleapis.com"
    assert request.url.path == "/v1/places:autocomplete"
    assert request.headers["x-goog-fieldmask"] == AUTOCOMPLETE_FIELDS
    assert request.headers["x-goog-api-key"] == "private-google-key"
    body = json.loads(request.content)
    assert body["input"] == "garden"
    assert body["sessionToken"] == TOKEN
    assert body["locationBias"]["circle"]["center"] == {"latitude": 43.65, "longitude": -79.38}
    assert "locationRestriction" not in body


def test_details_normalization_and_session(places_client):
    client, requests, *_ = places_client
    response = client.get("/api/places/test-place", params={"session_token": TOKEN})
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "A garden"
    assert body["location"] == DETAIL["location"]
    assert body["viewport"] == DETAIL["viewport"]
    assert body["attributions"] == [{"provider": "Provider", "provider_uri": "https://example.com"}]
    assert requests[0].url.params["sessionToken"] == TOKEN
    assert requests[0].url.path == "/v1/places/test-place"
    assert requests[0].headers["x-goog-fieldmask"] == DETAIL_FIELDS
    assert "private-google-key" not in response.text
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "changes",
    [
        {"query": " "},
        {"query": "x"},
        {"query": "x" * 201},
        {"session_token": "bad"},
        {"latitude": 91},
        {"longitude": -181},
        {"latitude": "nan"},
        {"longitude": None},
    ],
)
def test_invalid_queries_do_not_reach_google(places_client, changes):
    client, requests, *_ = places_client
    params = {**PARAMS, **changes}
    params = {key: value for key, value in params.items() if value is not None}
    response = client.get("/api/places/autocomplete", params=params)
    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"
    assert not requests


def test_invalid_place_id_does_not_reach_google(places_client):
    client, requests, *_ = places_client
    assert client.get("/api/places/unsafe.id", params={"session_token": TOKEN}).status_code == 422
    assert not requests


def test_empty_results_and_missing_optional_details(places_client):
    client, _, state, *_ = places_client
    state["body"] = {}
    assert client.get("/api/places/autocomplete", params=PARAMS).json() == {"suggestions": []}
    state["body"] = {
        key: value
        for key, value in DETAIL.items()
        if key not in {"viewport", "attributions", "formattedAddress"}
    }
    body = client.get("/api/places/test-place", params={"session_token": TOKEN}).json()
    assert body["viewport"] is None
    assert body["attributions"] == []
    assert body["address"] == ""


@pytest.mark.parametrize("operation", ["autocomplete", "details"])
@pytest.mark.parametrize("failure", ["status", "timeout", "malformed", "missing-key"])
def test_provider_errors_are_sanitized(places_client, operation, failure):
    client, requests, state, _, provider = places_client
    if failure == "status":
        state["status"] = 403
        state["body"] = {"error": "private-google-key"}
    elif failure == "timeout":
        state["timeout"] = True
    elif failure == "malformed":
        state["body"] = {"suggestions": None}
    else:
        provider.api_key = ""
    url = "/api/places/autocomplete" if operation == "autocomplete" else "/api/places/test-place"
    response = client.get(
        url, params=PARAMS if operation == "autocomplete" else {"session_token": TOKEN}
    )
    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"
    assert "private-google-key" not in response.text
    assert "private-provider-error" not in response.text
    if failure == "missing-key":
        assert not requests


@pytest.mark.parametrize("operation,limit", [("autocomplete", 120), ("details", 60)])
def test_rate_limit_and_expiry(places_client, monkeypatch, operation, limit):
    client, requests, _, limiter, _ = places_client
    now = [1000.0]
    monkeypatch.setattr("app.services.places.monotonic", lambda: now[0])
    for _ in range(limit):
        limiter.check(operation)
    path = "/api/places/autocomplete" if operation == "autocomplete" else "/api/places/test-place"
    params = PARAMS if operation == "autocomplete" else {"session_token": TOKEN}
    response = client.get(path, params=params)
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert response.headers["cache-control"] == "no-store"
    assert not requests
    now[0] += 61
    assert client.get(path, params=params).status_code == 200


def test_nearby_is_public_bounded_and_normalized_without_session_or_database(places_client):
    import json

    client, requests, state, *_ = places_client
    state["body"] = {"places": [{**DETAIL, "types": ["park"]}]}
    response = client.get(
        "/api/places/nearby", params={"latitude": 43, "longitude": -81, "radius": 2400}
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["places"][0]["types"] == ["park"]
    assert response.json()["places"][0]["attributions"][0]["provider"] == "Provider"
    request = requests[0]
    assert request.url.path == "/v1/places:searchNearby"
    assert request.headers["x-goog-fieldmask"] == NEARBY_FIELDS
    body = json.loads(request.content)
    assert body["locationRestriction"]["circle"] == {
        "center": {"latitude": 43, "longitude": -81},
        "radius": 2400,
    }
    assert body["includedTypes"] == EXPERIENCE_TYPES
    assert body["maxResultCount"] == 20
    assert body["rankPreference"] == "DISTANCE"
    assert "sessionToken" not in body
    assert "rating" not in NEARBY_FIELDS and "reviews" not in NEARBY_FIELDS


@pytest.mark.parametrize(
    "changes",
    [
        {"latitude": 91},
        {"longitude": -181},
        {"radius": 5001},
        {"radius": 0},
        {"radius": "nan"},
        {"latitude": "inf"},
    ],
)
def test_invalid_nearby_does_not_call_provider(places_client, changes):
    client, requests, *_ = places_client
    response = client.get(
        "/api/places/nearby", params={"latitude": 43, "longitude": -81, "radius": 2000, **changes}
    )
    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"
    assert not requests


@pytest.mark.parametrize("body", [{}, {"places": []}])
def test_empty_nearby_results(places_client, body):
    client, _, state, *_ = places_client
    state["body"] = body
    assert client.get(
        "/api/places/nearby", params={"latitude": 43, "longitude": -81, "radius": 2000}
    ).json() == {"places": []}


@pytest.mark.parametrize("failure", ["status", "timeout", "malformed", "missing-key", "rate"])
def test_nearby_failure_is_sanitized(places_client, failure):
    client, requests, state, limiter, provider = places_client
    if failure == "status":
        state["status"] = 403
    elif failure == "timeout":
        state["timeout"] = True
    elif failure == "malformed":
        state["body"] = {"places": [{"id": "private-provider-error"}]}
    elif failure == "missing-key":
        provider.api_key = ""
    else:
        for _ in range(60):
            limiter.check("nearby")
    response = client.get(
        "/api/places/nearby", params={"latitude": 43, "longitude": -81, "radius": 2000}
    )
    assert response.status_code == (429 if failure == "rate" else 503)
    assert response.headers["cache-control"] == "no-store"
    assert "private-google-key" not in response.text
    assert "private-provider-error" not in response.text
    if failure in {"missing-key", "rate"}:
        assert not requests
