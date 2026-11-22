from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

CharacterColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class CharacterAppearance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: Literal["feminine", "masculine"]
    hairStyle: Literal["short", "wavy", "curly", "bun"]
    hairColor: CharacterColor
    skinTone: CharacterColor
    shirt: CharacterColor
    pants: CharacterColor
    shoes: CharacterColor
    hat: Literal["none", "cap", "beanie"]
