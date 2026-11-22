from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.domain import Category
from app.schemas.social import UserSummary


class OnboardingWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interests: list[Category] = Field(min_length=1, max_length=len(Category))

    @field_validator("interests")
    @classmethod
    def unique_interests(cls, value: list[Category]) -> list[Category]:
        if len(value) != len(set(value)):
            raise ValueError("Choose each interest only once")
        return value


class MyProfile(BaseModel):
    user: UserSummary
    interests: list[Category]
    onboarding_completed_at: datetime | None
    experience_count: int
    saved_place_count: int
    following_count: int
