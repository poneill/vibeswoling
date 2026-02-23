"""Warmup set generation algorithm."""

import math

from models import SetPlan


def _nice_weights(bar_weight: float, up_to: float) -> list[float]:
    """Generate 'nice' plate-level weights from bar up to (but not including) up_to.

    Nice weights use only 45s and 25s — no change plates (15, 10, 5, 2.5).
    Per side, the nice plate combos are: 0, 25, 45, 45+25, 2×45, 2×45+25, ...
    So per-side increments cycle: +25, +20, +25, +20, ... (i.e., 25 then 45-25=20)
    Or equivalently, total weight increments of +50, +40, +50, +40, ...
    """
    weights = [bar_weight]
    # Per-side amounts using only 45s and 25s, ascending
    per_side = 0
    num_45s = 0
    has_25 = False
    while True:
        if not has_25:
            # Add a 25
            per_side += 25
            has_25 = True
        else:
            # Swap the 25 for another 45
            per_side += 20  # +45 - 25
            num_45s += 1
            has_25 = False
        total = bar_weight + per_side * 2
        if total >= up_to:
            break
        weights.append(total)
    return weights


def generate_warmup(work_weight: float, bar_weight: float) -> list[SetPlan]:
    """Generate warmup sets leading up to work_weight.

    Rules:
    1. Always start with bar x 5 reps.
    2. Never add more than 90 lbs between consecutive warmup sets.
    3. Three total warmup sets, unless rule 2 requires more.
    4. Penultimate warmup = 3 reps, last warmup = 1 rep.
    5. Two-minute rest after the last warmup, others ad libitum.

    Preferences:
    - Strongly prefer "nice" plate-level weights (only 45s and 25s on the bar).
    - The last warmup should land on a plate level just below work weight,
      so you only need to add change plates once (for the work sets).
    """
    gap = work_weight - bar_weight
    if gap <= 0:
        # Work weight is the bar — just one warmup set
        return [SetPlan(bar_weight, 5, "warmup", 120)]

    nice = _nice_weights(bar_weight, work_weight)
    # nice always starts with bar_weight and contains only plate-level weights < work_weight

    if len(nice) == 1:
        # Only the bar is below work weight (work weight is small, e.g. 55 on a 45 bar)
        return [SetPlan(bar_weight, 5, "warmup", 120)]

    # The last warmup should be the highest nice weight below work_weight.
    last_warmup = nice[-1]

    # Now pick intermediate warmup weights from the nice list.
    # We need: bar (first), ..., last_warmup (last), then jump to work_weight.
    # All gaps between consecutive warmups AND from last warmup to work must be <= 90.

    # Start with just bar and last_warmup, then fill in if gaps are too big.
    candidates = [w for w in nice if w < last_warmup]  # bar through second-to-last nice
    candidates.append(last_warmup)

    # Greedily select: always include bar (first) and last_warmup (last).
    # Fill the middle from nice weights to satisfy the 90lb rule.
    selected = [bar_weight]
    for w in candidates[1:]:
        # Check if we need intermediate steps between selected[-1] and w
        while w - selected[-1] > 90:
            # Find the highest nice weight that's <= selected[-1] + 90
            fill = [n for n in nice if selected[-1] < n <= selected[-1] + 90]
            if fill:
                selected.append(fill[-1])
            else:
                # Shouldn't happen, but fallback: midpoint rounded to 5
                mid = round((selected[-1] + w) / 2 / 5) * 5
                selected.append(mid)
                break
        if w not in selected:
            selected.append(w)

    # Also verify the jump from last warmup to work_weight is <= 90
    while work_weight - selected[-1] > 90:
        fill = [n for n in nice if selected[-1] < n <= selected[-1] + 90]
        if fill:
            selected.append(fill[-1])
        else:
            mid = round((selected[-1] + work_weight) / 2 / 5) * 5
            selected.append(mid)
            break

    # Ensure we have at least 3 warmup sets by adding nice intermediates
    while len(selected) < 3:
        # Insert a nice weight in the biggest gap
        biggest_gap = 0
        insert_idx = 1
        points = selected + [work_weight]
        for i in range(len(points) - 1):
            g = points[i + 1] - points[i]
            if g > biggest_gap:
                biggest_gap = g
                insert_idx = i + 1
        # Find a nice weight in this gap
        lo = points[insert_idx - 1]
        hi = points[insert_idx] if insert_idx < len(selected) else work_weight
        candidates_mid = [n for n in nice if lo < n < hi and n not in selected]
        if candidates_mid:
            # Pick the middle one
            mid = candidates_mid[len(candidates_mid) // 2]
            selected.insert(insert_idx, mid)
        else:
            break  # Can't add more nice weights

    # Assign reps based on position
    n = len(selected)
    sets: list[SetPlan] = []
    for i, w in enumerate(selected):
        if n == 1:
            reps = 5
            rest = 120
        elif i == n - 1:
            reps = 1
            rest = 120
        elif i == n - 2:
            reps = 3
            rest = None
        else:
            reps = 5
            rest = None
        sets.append(SetPlan(w, reps, "warmup", rest))

    return sets


def generate_workout(work_weight: float, work_reps: int, num_work_sets: int,
                     bar_weight: float) -> list[SetPlan]:
    """Generate a full workout plan: warmup sets + work sets.

    Work sets have 5-minute rests between them (except the last).
    """
    sets = generate_warmup(work_weight, bar_weight)

    for i in range(num_work_sets):
        rest = 300 if i < num_work_sets - 1 else None  # 5 min between work sets
        sets.append(SetPlan(work_weight, work_reps, "work", rest))

    return sets
