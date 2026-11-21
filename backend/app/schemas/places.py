from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_validator

PlaceId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,255}$")]


class AutocompleteQuery(BaseModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
    session_token: UUID
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def paired_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be supplied together")
        return self


class Coordinates(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class Viewport(BaseModel):
    low: Coordinates
    high: Coordinates


class PlaceSuggestion(BaseModel):
    place_id: str
    primary_text: str
    secondary_text: str = ""


class AutocompleteResponse(BaseModel):
    suggestions: list[PlaceSuggestion]


class PlaceAttribution(BaseModel):
    provider: str
    provider_uri: str | None = None


class PlaceDetails(BaseModel):
    place_id: str
    display_name: str
    address: str
    location: Coordinates
    viewport: Viewport | None = None
    google_maps_uri: str
    attributions: list[PlaceAttribution] = []
