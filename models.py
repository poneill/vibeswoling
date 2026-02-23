from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class LiftRecord:
    """One row from the CSV, after normalization."""
    date: datetime
    lift_name: str          # Canonical name
    weight: float | None    # None for pullups or missing data
    reps: int | None        # None when missing
    notes: str = ""


@dataclass
class SetPlan:
    """A single planned set in a workout."""
    weight: float
    reps: int
    set_type: str           # "warmup" or "work"
    rest_seconds: int | None  # None = ad libitum


LIFT_ALIASES: dict[str, str] = {
    # barbell squat
    "squat": "barbell squat",
    "back squat": "barbell squat",
    "bs": "barbell squat",
    "pause squat": "barbell squat",
    # front squat
    "fs": "front squat",
    "front squat": "front squat",
    # safety bar squat
    "sbs": "safety bar squat",
    "safety bar squat": "safety bar squat",
    # deadlift
    "dl": "deadlift",
    "deadlift": "deadlift",
    "tdl": "deadlift",
    "squat dl": "deadlift",
    # hex bar deadlift
    "hdl": "hex bar deadlift",
    "hex bar": "hex bar deadlift",
    "high hex bar": "hex bar deadlift",
    "hex bar deadlift": "hex bar deadlift",
    # bench
    "bench": "bench",
    # overhead press
    "ohp": "overhead press",
    "press": "overhead press",
    "ohr": "overhead press",
    "overhead press": "overhead press",
    # pullups
    "pullups": "pullups",
    "blue pullups": "pullups",
    "assisted pullups": "pullups",
}

MAIN_LIFTS = [
    "barbell squat",
    "front squat",
    "safety bar squat",
    "deadlift",
    "hex bar deadlift",
    "bench",
    "overhead press",
    "pullups",
]

BAR_WEIGHTS: dict[str, float] = {
    "barbell squat": 45,
    "front squat": 45,
    "safety bar squat": 65,
    "deadlift": 45,
    "hex bar deadlift": 65,
    "bench": 45,
    "overhead press": 45,
}

# Bodyweight exercises where a lone number means reps, not weight
BODYWEIGHT_LIFTS = {"pullups", "dips", "blue pullups", "assisted pullups"}

# Reverse mapping: canonical name -> preferred CSV abbreviation
CANONICAL_TO_CSV: dict[str, str] = {
    "barbell squat": "squat",
    "front squat": "fs",
    "safety bar squat": "sbs",
    "deadlift": "dl",
    "hex bar deadlift": "hdl",
    "bench": "bench",
    "overhead press": "ohp",
    "pullups": "pullups",
}

AVAILABLE_PLATES = [45, 25, 15, 10, 5, 2.5]


def plates_for_weight(total_weight: float, bar_weight: float) -> str:
    """Return a human-readable plate breakdown per side.

    Example: plates_for_weight(225, 45) -> "2×45"
             plates_for_weight(185, 45) -> "45+25"
             plates_for_weight(45, 45)  -> "bar"
    """
    if total_weight <= bar_weight:
        return "bar"

    per_side = (total_weight - bar_weight) / 2
    plates: list[str] = []

    remaining = per_side
    for plate in AVAILABLE_PLATES:
        count = int(remaining // plate)
        if count > 0:
            remaining -= count * plate
            remaining = round(remaining, 1)  # avoid float drift
            if count == 1:
                plates.append(str(plate) if plate != int(plate) else str(int(plate)))
            else:
                plates.append(f"{count}\u00d7{int(plate) if plate == int(plate) else plate}")

    if not plates:
        return "bar"

    return "+".join(plates)
