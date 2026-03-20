"""Parse and write ~/misc/lifts.csv with all its quirks."""

import os
import re
from datetime import datetime

from models import BODYWEIGHT_LIFTS, CANONICAL_TO_CSV, LIFT_ALIASES, LiftRecord


def _parse_date(s: str) -> datetime:
    """Parse the messy date formats found in lifts.csv."""
    s = s.strip()
    # Normalize day name: "MON" -> "Mon", "Sunday" -> "Sun", "MONDAY" -> "Mon"
    s = re.sub(
        r"^(\w+)",
        lambda m: m.group(1).capitalize()[:3],
        s,
    )
    # Strip timezone abbreviation (EDT, EST, etc.)
    s = re.sub(r"\s+(EDT|EST|CDT|CST|PDT|PST)\s+", " ", s)
    # Collapse multiple spaces (e.g., "Feb  6" -> "Feb 6" for strptime)
    # Actually strptime handles this if we use the right format
    return datetime.strptime(s, "%a %b %d %H:%M:%S %Y")


def _normalize_lift_name(raw: str) -> tuple[str, str]:
    """Clean up a raw lift name and return (canonical_name, annotation_notes).

    Strips bracket annotations like [!] or [yay!], lowercases, looks up alias.
    """
    raw = raw.strip()
    # Extract bracket annotations
    annotations = re.findall(r"\[([^\]]*)\]", raw)
    annotation_note = " ".join(annotations)
    # Remove brackets from name
    cleaned = re.sub(r"\s*\[.*?\]", "", raw).strip().lower()

    canonical = LIFT_ALIASES.get(cleaned, cleaned)
    return canonical, annotation_note


def _is_bodyweight_lift(raw_name: str) -> bool:
    """Check if a lift name (before alias resolution) is bodyweight-only."""
    cleaned = re.sub(r"\s*\[.*?\]", "", raw_name).strip().lower()
    return cleaned in BODYWEIGHT_LIFTS or LIFT_ALIASES.get(cleaned) in BODYWEIGHT_LIFTS


def _try_parse_float(s: str) -> float | None:
    """Try to parse a string as a float, return None on failure."""
    try:
        return float(s.strip())
    except (ValueError, TypeError):
        return None


def _try_parse_int(s: str) -> int | None:
    """Try to extract a leading integer from a string."""
    m = re.match(r"^\s*(\d+)", s)
    if m:
        return int(m.group(1))
    return None


def _extract_paren_note(s: str) -> tuple[str, str]:
    """Split 'value (note)' into ('value', 'note').

    Returns (cleaned_value, note_text).
    """
    m = re.match(r"^([^(]*)\(([^)]*)\)\s*$", s)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return s.strip(), ""


def _split_tokens(line: str) -> list[str]:
    """Split a CSV line on ', ' with handling for missing-space commas like '75,5'."""
    tokens = line.split(", ")
    result = []
    for token in tokens:
        # Check for bare-comma between digits: "75,5" or "150,5"
        if re.match(r"^\d+,\d+$", token.strip()):
            parts = token.strip().split(",")
            result.extend(parts)
        else:
            result.append(token)
    return result


def parse_csv(filepath: str) -> list[LiftRecord]:
    """Parse lifts.csv and return a sorted list of LiftRecords."""
    records: list[LiftRecord] = []
    filepath = os.path.expanduser(filepath)

    with open(filepath) as f:
        lines = f.readlines()

    for lineno, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue
        # Skip header
        if line.startswith("date"):
            continue

        tokens = _split_tokens(line)
        if len(tokens) < 2:
            continue

        # --- Date ---
        try:
            date = _parse_date(tokens[0])
        except ValueError:
            print(f"WARNING: Could not parse date on line {lineno}: {tokens[0]!r}")
            continue

        # --- Lift name ---
        raw_lift = tokens[1]
        lift_name, annotation_note = _normalize_lift_name(raw_lift)
        is_bw = _is_bodyweight_lift(raw_lift)

        # --- Weight, Reps, Notes ---
        weight: float | None = None
        reps: int | None = None
        bodyweight: float | None = None
        notes_parts: list[str] = []

        if annotation_note:
            notes_parts.append(annotation_note)

        remaining = tokens[2:]

        if not remaining:
            # Just date and lift, nothing else
            pass
        elif is_bw:
            # Check for bw:NNN token indicating weighted pullup format
            bw_value = None
            bw_token_idx = None
            for i, t in enumerate(remaining):
                bw_match = re.match(r"^bw:(\d+\.?\d*)$", t.strip())
                if bw_match:
                    bw_value = float(bw_match.group(1))
                    bw_token_idx = i
                    break

            if bw_value is not None:
                # New weighted format: added_weight, reps, bw:NNN[, notes]
                bodyweight = bw_value
                non_bw = [t for i, t in enumerate(remaining) if i != bw_token_idx]
                # First token = added weight, second = reps, rest = notes
                if non_bw:
                    w = _try_parse_float(non_bw[0])
                    if w is not None:
                        weight = w
                if len(non_bw) > 1:
                    reps = _try_parse_int(non_bw[1])
                for t in non_bw[2:]:
                    t = t.strip()
                    if t:
                        notes_parts.append(t)
            else:
                # Legacy bodyweight format: numbers are reps (no weight)
                reps_found = False
                for t in remaining:
                    t = t.strip()
                    if not t or t.upper() == "NA":
                        continue
                    if not reps_found:
                        # Handle "195. 5" typo pattern for pullups
                        m = re.match(r"^\d+\.\s+(\d+)$", t)
                        if m:
                            reps = int(m.group(1))
                            reps_found = True
                            continue
                        val, note = _extract_paren_note(t)
                        if note:
                            notes_parts.append(note)
                        parsed_reps = _try_parse_int(val)
                        if parsed_reps is not None:
                            reps = parsed_reps
                            reps_found = True
                            continue
                    # Everything else is notes
                    notes_parts.append(t)
        else:
            # Standard lift: weight [, reps [, notes]]
            # Token index 0 -> weight
            if remaining:
                token = remaining[0].strip()
                if token.upper() == "NA":
                    weight = None
                elif token.startswith("("):
                    # Parenthetical note where weight should be
                    _, note = _extract_paren_note(token)
                    if note:
                        notes_parts.append(note)
                    elif token.strip("() "):
                        notes_parts.append(token.strip("() "))
                else:
                    val, note = _extract_paren_note(token)
                    if note:
                        notes_parts.append(note)
                    weight = _try_parse_float(val)
                    if weight is None:
                        # Not a number, treat as notes
                        notes_parts.append(token)

            # Token index 1 -> reps
            if len(remaining) > 1:
                token = remaining[1].strip()
                if token.startswith("("):
                    _, note = _extract_paren_note(token)
                    if note:
                        notes_parts.append(note)
                    elif token.strip("() "):
                        notes_parts.append(token.strip("() "))
                else:
                    val, note = _extract_paren_note(token)
                    if note:
                        notes_parts.append(note)
                    reps = _try_parse_int(val)
                    if reps is None and val:
                        notes_parts.append(val)

            # Remaining tokens -> notes
            for t in remaining[2:]:
                t = t.strip()
                if t:
                    notes_parts.append(t)

        notes = " ".join(notes_parts).strip()
        # Clean up note formatting
        notes = re.sub(r"\s+", " ", notes)

        records.append(
            LiftRecord(
                date=date,
                lift_name=lift_name,
                weight=weight,
                reps=reps,
                notes=notes,
                bodyweight=bodyweight,
            )
        )

    records.sort(key=lambda r: r.date)
    return records


def append_to_csv(filepath: str, records: list[LiftRecord]) -> None:
    """Append completed workout sets to the CSV in the existing format."""
    filepath = os.path.expanduser(filepath)
    with open(filepath, "a") as f:
        for rec in records:
            date_str = rec.date.strftime("%a %b %e %H:%M:%S EST %Y")
            # %e gives space-padded day, matching existing format like "Feb  6"
            csv_name = CANONICAL_TO_CSV.get(rec.lift_name, rec.lift_name)
            parts = [date_str, csv_name]
            if rec.bodyweight is not None:
                # Weighted pullup format: added_weight, reps, bw:NNN
                added = rec.weight or 0
                w = int(added) if added == int(added) else added
                parts.append(str(w))
                if rec.reps is not None:
                    parts.append(str(rec.reps))
                bw = (
                    int(rec.bodyweight)
                    if rec.bodyweight == int(rec.bodyweight)
                    else rec.bodyweight
                )
                parts.append(f"bw:{bw}")
                if rec.notes:
                    parts.append(rec.notes)
            else:
                if rec.weight is not None:
                    w = int(rec.weight) if rec.weight == int(rec.weight) else rec.weight
                    parts.append(str(w))
                if rec.reps is not None:
                    parts.append(str(rec.reps))
                if rec.notes:
                    parts.append(rec.notes)
            f.write(", ".join(parts) + "\n")


if __name__ == "__main__":
    recs = parse_csv("~/misc/lifts.csv")
    print(f"Parsed {len(recs)} records\n")

    # Summary by lift
    from collections import Counter

    counts = Counter(r.lift_name for r in recs)
    print("Records per lift:")
    for lift, count in counts.most_common():
        print(f"  {lift}: {count}")

    # Show any records with missing weight/reps for main lifts
    from models import MAIN_LIFTS

    print("\nMain lift records missing weight or reps:")
    for r in recs:
        if r.lift_name in MAIN_LIFTS:
            if r.weight is None and r.lift_name != "pullups":
                print(
                    f"  {r.date.date()} {r.lift_name}: weight=None reps={r.reps} notes={r.notes!r}"
                )
            if r.reps is None:
                print(
                    f"  {r.date.date()} {r.lift_name}: weight={r.weight} reps=None notes={r.notes!r}"
                )
