"""Effective 1RM calculation and workout suggestion logic."""


def epley(w: float, r: int) -> float:
    if r <= 1:
        return w
    return w * (1 + r / 30)


def brzycki(w: float, r: int) -> float:
    if r <= 1:
        return w
    if r >= 37:
        return w * 36  # degenerate case, cap it
    return w * 36 / (37 - r)


def lombardi(w: float, r: int) -> float:
    if r <= 1:
        return w
    return w * (r ** 0.10)


def effective_1rm(w: float, r: int) -> float:
    """Average of Epley, Brzycki, and Lombardi."""
    return round((epley(w, r) + brzycki(w, r) + lombardi(w, r)) / 3, 1)


def volume(w: float, r: int) -> float:
    return w * r


def suggest_next(last_weight: float, last_reps: int, bar_weight: float = 45) -> dict:
    """Suggest the next workout based on the last one.

    Returns {
        "default": {"weight": W+5, "reps": R, "orm": ...},
        "alternatives": [{"weight", "reps", "orm"}, ...] sorted by orm
    }

    Alternatives are all (W', R') where:
      1RM(W, R) < 1RM(W', R') <= 1RM(W+5, R)
      W' is a multiple of 5
      W' >= bar_weight
      R' in [1, 20]
    """
    current_orm = effective_1rm(last_weight, last_reps)
    target_orm = effective_1rm(last_weight + 5, last_reps)
    default = {
        "weight": last_weight + 5,
        "reps": last_reps,
        "orm": target_orm,
    }

    alternatives = []
    # Search a reasonable weight range
    min_w = max(bar_weight, last_weight - 40)
    max_w = last_weight + 10
    for w_int in range(int(min_w), int(max_w) + 1, 5):
        w = float(w_int)
        for r in range(1, 21):
            orm = effective_1rm(w, r)
            if current_orm < orm <= target_orm:
                # Skip the default suggestion itself
                if w == last_weight + 5 and r == last_reps:
                    continue
                alternatives.append({
                    "weight": w,
                    "reps": r,
                    "orm": round(orm, 1),
                })

    alternatives.sort(key=lambda x: x["orm"])
    return {"default": default, "alternatives": alternatives}
