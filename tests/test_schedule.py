"""Tests for weekly planning: status tracking and suggestions."""

from datetime import date, datetime

from models import LiftRecord, category_for_lift
from schedule import compute_weekly_status, compute_suggestions, week_start


def _rec(dt_str: str, lift: str, weight=None, reps=None):
    """Shorthand to create a LiftRecord."""
    return LiftRecord(
        date=datetime.strptime(dt_str, "%Y-%m-%d"),
        lift_name=lift,
        weight=weight,
        reps=reps,
    )


class TestCategoryForLift:
    def test_squat_variants(self):
        assert category_for_lift("barbell squat") == "squat"
        assert category_for_lift("front squat") == "squat"
        assert category_for_lift("safety bar squat") == "squat"

    def test_deadlift_variants(self):
        assert category_for_lift("deadlift") == "deadlift"
        assert category_for_lift("hex bar deadlift") == "deadlift"

    def test_single_lift_categories(self):
        assert category_for_lift("bench") == "bench"
        assert category_for_lift("overhead press") == "ohp"
        assert category_for_lift("pullups") == "pullups"

    def test_unknown_lift(self):
        assert category_for_lift("curls") is None


class TestWeekStart:
    def test_monday(self):
        assert week_start(date(2026, 2, 23)) == date(2026, 2, 23)  # Monday

    def test_midweek(self):
        assert week_start(date(2026, 2, 25)) == date(2026, 2, 23)  # Wednesday

    def test_sunday(self):
        assert week_start(date(2026, 3, 1)) == date(2026, 2, 23)  # Sunday


class TestWeeklyStatus:
    def test_empty_records(self):
        status = compute_weekly_status([], ref_date=date(2026, 2, 25))
        assert status["done_total"] == 0
        assert status["target_total"] == 6
        for info in status["categories"].values():
            assert info["done"] == 0

    def test_one_squat_done(self):
        records = [_rec("2026-02-23", "barbell squat", 185, 5)]
        status = compute_weekly_status(records, ref_date=date(2026, 2, 25))
        assert status["categories"]["squat"]["done"] == 1
        assert status["categories"]["deadlift"]["done"] == 0
        assert status["done_total"] == 1

    def test_variant_satisfies_category(self):
        records = [_rec("2026-02-24", "front squat", 135, 5)]
        status = compute_weekly_status(records, ref_date=date(2026, 2, 25))
        assert status["categories"]["squat"]["done"] == 1

    def test_pullups_need_two(self):
        records = [
            _rec("2026-02-23", "pullups", None, 8),
        ]
        status = compute_weekly_status(records, ref_date=date(2026, 2, 25))
        assert status["categories"]["pullups"]["done"] == 1
        assert status["categories"]["pullups"]["target"] == 2

    def test_pullups_two_different_days(self):
        records = [
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-25", "pullups", None, 6),
        ]
        status = compute_weekly_status(records, ref_date=date(2026, 2, 25))
        assert status["categories"]["pullups"]["done"] == 2

    def test_pullups_same_day_counts_once(self):
        records = [
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-23", "pullups", None, 6),
        ]
        status = compute_weekly_status(records, ref_date=date(2026, 2, 25))
        assert status["categories"]["pullups"]["done"] == 1

    def test_records_outside_week_ignored(self):
        records = [_rec("2026-02-20", "bench", 150, 5)]  # Previous Friday
        status = compute_weekly_status(records, ref_date=date(2026, 2, 25))
        assert status["categories"]["bench"]["done"] == 0

    def test_perfect_week(self):
        records = [
            _rec("2026-02-23", "barbell squat", 185, 5),
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-24", "bench", 150, 5),
            _rec("2026-02-25", "deadlift", 295, 5),
            _rec("2026-02-25", "pullups", None, 6),
            _rec("2026-02-26", "overhead press", 105, 5),
        ]
        status = compute_weekly_status(records, ref_date=date(2026, 2, 27))
        assert status["done_total"] == 6
        assert status["target_total"] == 6


class TestSuggestions:
    def test_empty_records_suggests_something(self):
        suggestions = compute_suggestions([], ref_date=date(2026, 2, 25))
        assert len(suggestions) > 0
        # Should suggest categories that have never been done
        cats = [s["category"] for s in suggestions]
        assert len(cats) <= 2

    def test_suggests_missing_categories(self):
        records = [
            _rec("2026-02-23", "barbell squat", 185, 5),
            _rec("2026-02-24", "bench", 150, 5),
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 25))
        cats = [s["category"] for s in suggestions]
        # Should NOT suggest squat or bench (already done this week)
        assert "squat" not in cats
        assert "bench" not in cats

    def test_prefers_stalest_category(self):
        # All categories have history, but deadlift is stalest
        records = [
            _rec("2026-01-25", "deadlift", 295, 5),       # 31 days ago
            _rec("2026-02-15", "overhead press", 105, 5),  # 10 days ago
            _rec("2026-02-18", "barbell squat", 185, 5),   # 7 days ago
            _rec("2026-02-20", "bench", 150, 5),           # 5 days ago
            _rec("2026-02-22", "pullups", None, 8),         # 3 days ago
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 25))
        # Deadlift is stalest, should be first suggestion
        assert suggestions[0]["category"] == "deadlift"

    def test_returns_at_most_two(self):
        suggestions = compute_suggestions([], ref_date=date(2026, 2, 25))
        assert len(suggestions) <= 2

    def test_all_done_returns_empty(self):
        records = [
            _rec("2026-02-23", "barbell squat", 185, 5),
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-24", "bench", 150, 5),
            _rec("2026-02-25", "deadlift", 295, 5),
            _rec("2026-02-25", "pullups", None, 6),
            _rec("2026-02-26", "overhead press", 105, 5),
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 27))
        assert suggestions == []

    def test_suggestion_includes_next_weight(self):
        # Give all categories recent history so bench is among the suggestions
        records = [
            _rec("2026-02-20", "bench", 150, 5),
            _rec("2026-02-23", "barbell squat", 185, 5),
            _rec("2026-02-23", "deadlift", 295, 5),
            _rec("2026-02-24", "overhead press", 105, 5),
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-25", "pullups", None, 6),
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 25))
        bench_sug = [s for s in suggestions if s["category"] == "bench"][0]
        assert bench_sug["suggestion"] is not None
        assert bench_sug["suggestion"]["default"]["weight"] == 155

    def test_pullups_suggestion_no_weight(self):
        # Only pullups not satisfied; all others done this week
        records = [
            _rec("2026-02-23", "barbell squat", 185, 5),
            _rec("2026-02-23", "deadlift", 295, 5),
            _rec("2026-02-24", "bench", 150, 5),
            _rec("2026-02-24", "overhead press", 105, 5),
            _rec("2026-02-20", "pullups", None, 8),  # before this week
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 25))
        pu_sug = [s for s in suggestions if s["category"] == "pullups"]
        assert len(pu_sug) == 1
        assert pu_sug[0]["suggestion"] is None

    def test_same_timestamp_uses_last_record(self):
        """When multiple sets share a timestamp, suggestion should use the
        last record in file order (the final set of the session).
        Reproduces: CSV has 295x5, 295x5, 295x5, 300x5, 300x5 all at same
        timestamp. Suggestion should show 300x5, not 295x5."""
        records = [
            # Simulate a deadlift session: warmups then work sets
            _rec("2026-01-24", "deadlift", 295, 5),
            _rec("2026-01-24", "deadlift", 295, 5),
            _rec("2026-01-24", "deadlift", 295, 5),
            _rec("2026-01-24", "deadlift", 300, 5),
            _rec("2026-01-24", "deadlift", 300, 5),
            # Fill other categories this week so deadlift is suggested
            _rec("2026-02-23", "barbell squat", 185, 5),
            _rec("2026-02-24", "bench", 150, 5),
            _rec("2026-02-24", "overhead press", 105, 5),
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-25", "pullups", None, 6),
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 25))
        dl_sug = [s for s in suggestions if s["category"] == "deadlift"][0]
        # Should show 300 (last set), not 295 (first set)
        assert dl_sug["last_weight"] == 300
        assert dl_sug["last_reps"] == 5
        # Suggestion should be based on 300x5 -> 305x5
        assert dl_sug["suggestion"]["default"]["weight"] == 305

    def test_uses_most_recent_variant(self):
        # All other categories done this week so squat is suggested
        records = [
            _rec("2026-02-20", "front squat", 135, 5),
            _rec("2026-01-10", "barbell squat", 185, 5),
            _rec("2026-02-23", "deadlift", 295, 5),
            _rec("2026-02-24", "bench", 150, 5),
            _rec("2026-02-24", "overhead press", 105, 5),
            _rec("2026-02-23", "pullups", None, 8),
            _rec("2026-02-25", "pullups", None, 6),
        ]
        suggestions = compute_suggestions(records, ref_date=date(2026, 2, 25))
        squat_sug = [s for s in suggestions if s["category"] == "squat"][0]
        # Should suggest front squat (most recent)
        assert squat_sug["lift_name"] == "front squat"
