"""Weekly planning: status tracking and workout suggestions."""

from collections import defaultdict
from datetime import date, datetime, timedelta

from models import (
    LIFT_CATEGORIES,
    WEEKLY_TARGETS,
    LiftRecord,
    category_for_lift,
)
from onerm import effective_1rm, suggest_next


def week_start(d: date | None = None) -> date:
    """Return the Monday of the ISO week containing *d* (default: today)."""
    if d is None:
        d = date.today()
    return d - timedelta(days=d.weekday())  # Monday = 0


def compute_weekly_status(records: list[LiftRecord],
                          ref_date: date | None = None) -> dict:
    """Return weekly checklist status.

    Returns {
        "week_start": "2026-02-17",
        "categories": {
            "squat":    {"target": 1, "done": 0},
            "deadlift": {"target": 1, "done": 1},
            ...
            "pullups":  {"target": 2, "done": 1},
        },
        "done_total": 2,
        "target_total": 6,
    }

    "done" counts distinct calendar days with at least one session in
    that category during the current ISO week.
    """
    ws = week_start(ref_date)
    we = ws + timedelta(days=7)

    # Track distinct days per category
    cat_days: dict[str, set[date]] = defaultdict(set)
    for r in records:
        rd = r.date.date() if isinstance(r.date, datetime) else r.date
        if ws <= rd < we:
            cat = category_for_lift(r.lift_name)
            if cat:
                cat_days[cat].add(rd)

    categories = {}
    done_total = 0
    target_total = 0
    for cat, target in WEEKLY_TARGETS.items():
        done = min(len(cat_days.get(cat, set())), target)
        categories[cat] = {"target": target, "done": done}
        done_total += done
        target_total += target

    return {
        "week_start": ws.isoformat(),
        "categories": categories,
        "done_total": done_total,
        "target_total": target_total,
    }


def compute_suggestions(records: list[LiftRecord],
                        ref_date: date | None = None,
                        bar_weights: dict[str, float] | None = None) -> list[dict]:
    """Return 1-2 suggested lifts for today.

    Each suggestion: {
        "category": "deadlift",
        "lift_name": "hex bar deadlift",  # most recently used variant
        "last_date": "Feb 15",
        "last_weight": 295,
        "last_reps": 5,
        "suggestion": { ... from suggest_next() ... } or None (pullups)
    }

    Ranked by: unsatisfied categories first, then days since last session
    (longest gap first).
    """
    from models import BAR_WEIGHTS, BODYWEIGHT_LIFTS
    if bar_weights is None:
        bar_weights = BAR_WEIGHTS

    if ref_date is None:
        ref_date = date.today()

    status = compute_weekly_status(records, ref_date)

    # Find most recent record per category
    last_per_cat: dict[str, LiftRecord] = {}
    for r in records:
        cat = category_for_lift(r.lift_name)
        if cat:
            if cat not in last_per_cat or r.date >= last_per_cat[cat].date:
                last_per_cat[cat] = r

    # Determine which categories still need work this week
    remaining = []
    for cat, info in status["categories"].items():
        if info["done"] < info["target"]:
            remaining.append(cat)

    if not remaining:
        # Everything done this week — suggest nothing (or the most stale)
        return []

    # Sort remaining by days since last session (longest first)
    def staleness(cat: str) -> float:
        if cat not in last_per_cat:
            return 9999  # never done — highest priority
        rd = last_per_cat[cat].date
        if isinstance(rd, datetime):
            rd = rd.date()
        return (ref_date - rd).days

    remaining.sort(key=staleness, reverse=True)

    suggestions = []
    for cat in remaining[:2]:
        last = last_per_cat.get(cat)
        if last is None:
            # Category never done — suggest the first variant
            lift_name = LIFT_CATEGORIES[cat][0]
            suggestions.append({
                "category": cat,
                "lift_name": lift_name,
                "last_date": None,
                "last_weight": None,
                "last_reps": None,
                "suggestion": None,
            })
            continue

        lift_name = last.lift_name
        is_bodyweight = lift_name in BODYWEIGHT_LIFTS

        # Find the most recent record with valid weight+reps for suggestion.
        # Use enumerate to break ties on equal timestamps: last in file wins.
        sug = None
        if not is_bodyweight:
            cat_lifts = set(LIFT_CATEGORIES[cat])
            for _, r in sorted(
                enumerate(records),
                key=lambda pair: (pair[1].date, pair[0]),
                reverse=True,
            ):
                if r.lift_name in cat_lifts and r.weight and r.reps:
                    bw = bar_weights.get(r.lift_name, 45)
                    sug = suggest_next(r.weight, r.reps, bw)
                    break

        last_date_str = last.date.strftime("%b %-d")
        suggestions.append({
            "category": cat,
            "lift_name": lift_name,
            "last_date": last_date_str,
            "last_weight": last.weight,
            "last_reps": last.reps,
            "suggestion": sug,
        })

    return suggestions
