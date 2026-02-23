"""Tests for CSV parsing logic."""

import os
import tempfile
from datetime import datetime

from csv_parser import (
    _extract_paren_note,
    _normalize_lift_name,
    _parse_date,
    _split_tokens,
    append_to_csv,
    parse_csv,
)
from models import LiftRecord


class TestParseDate:
    def test_standard_format(self):
        d = _parse_date("Mon Feb 10 18:30:00 2025")
        assert d == datetime(2025, 2, 10, 18, 30, 0)

    def test_strips_timezone(self):
        d = _parse_date("Sat Jan 24 20:22:18 EST 2026")
        assert d == datetime(2026, 1, 24, 20, 22, 18)

    def test_normalizes_uppercase_day(self):
        d = _parse_date("MON Feb 10 18:30:00 2025")
        assert d == datetime(2025, 2, 10, 18, 30, 0)

    def test_normalizes_full_day_name(self):
        d = _parse_date("Sunday Feb 10 18:30:00 2025")
        assert d.weekday() == 0  # strptime parsed it; day name truncated to Sun


class TestNormalizeLiftName:
    def test_alias_resolution(self):
        assert _normalize_lift_name("dl")[0] == "deadlift"
        assert _normalize_lift_name("bs")[0] == "barbell squat"
        assert _normalize_lift_name("ohp")[0] == "overhead press"

    def test_strips_brackets(self):
        name, note = _normalize_lift_name("bench [!]")
        assert name == "bench"
        assert note == "!"

    def test_case_insensitive(self):
        assert _normalize_lift_name("DL")[0] == "deadlift"
        assert _normalize_lift_name("OHP")[0] == "overhead press"

    def test_unknown_lift_passes_through(self):
        assert _normalize_lift_name("curls")[0] == "curls"


class TestSplitTokens:
    def test_normal_split(self):
        assert _split_tokens("a, b, c") == ["a", "b", "c"]

    def test_bare_comma_between_digits(self):
        # "75,5" should split into ["75", "5"]
        tokens = _split_tokens("Mon Jan 1 12:00:00 2025, bench, 75,5")
        assert "75" in tokens
        assert "5" in tokens

    def test_no_false_split_on_text_comma(self):
        tokens = _split_tokens("a, hello,world, c")
        # "hello,world" doesn't match ^\d+,\d+$ so stays together
        assert "hello,world" in tokens


class TestExtractParenNote:
    def test_value_with_note(self):
        val, note = _extract_paren_note("295 (very easy)")
        assert val == "295"
        assert note == "very easy"

    def test_no_parens(self):
        val, note = _extract_paren_note("295")
        assert val == "295"
        assert note == ""


class TestParseCsv:
    """Integration tests using small temp CSV files."""

    def _parse_lines(self, *lines):
        """Write lines to a temp file and parse them."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            for line in lines:
                f.write(line + "\n")
            path = f.name
        try:
            return parse_csv(path)
        finally:
            os.unlink(path)

    def test_standard_barbell_row(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, bench, 150, 5"
        )
        assert len(recs) == 1
        assert recs[0].lift_name == "bench"
        assert recs[0].weight == 150
        assert recs[0].reps == 5

    def test_bodyweight_lift(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, pullups, 8"
        )
        assert len(recs) == 1
        assert recs[0].weight is None
        assert recs[0].reps == 8

    def test_bodyweight_with_NA(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, assisted pullups, NA, 5"
        )
        assert len(recs) == 1
        assert recs[0].lift_name == "pullups"
        assert recs[0].weight is None
        assert recs[0].reps == 5

    def test_notes_preserved(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, dl, 295, 5, very easy"
        )
        assert recs[0].notes == "very easy"

    def test_bracket_annotation_becomes_note(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, bench [!], 150, 5"
        )
        assert recs[0].lift_name == "bench"
        assert "!" in recs[0].notes

    def test_parenthetical_note_in_reps(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, dl, 295, 5 (good!)"
        )
        assert recs[0].reps == 5
        assert "good!" in recs[0].notes

    def test_bare_comma_weight_reps(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, bench, 75,5"
        )
        assert recs[0].weight == 75
        assert recs[0].reps == 5

    def test_skips_blank_lines(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, bench, 150, 5",
            "",
            "Tue Feb 11 18:30:00 EST 2025, dl, 225, 5",
        )
        assert len(recs) == 2

    def test_skips_header(self):
        recs = self._parse_lines(
            "date, lift, weight, reps",
            "Mon Feb 10 18:30:00 EST 2025, bench, 150, 5",
        )
        assert len(recs) == 1

    def test_sorted_by_date(self):
        recs = self._parse_lines(
            "Tue Feb 11 18:30:00 EST 2025, dl, 225, 5",
            "Mon Feb 10 18:30:00 EST 2025, bench, 150, 5",
        )
        assert recs[0].date < recs[1].date

    def test_alias_resolution_in_full_parse(self):
        recs = self._parse_lines(
            "Mon Feb 10 18:30:00 EST 2025, sbs, 175, 5"
        )
        assert recs[0].lift_name == "safety bar squat"


class TestAppendToCsv:
    def test_round_trip(self):
        """Records appended to CSV can be parsed back."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            path = f.name

        try:
            records = [
                LiftRecord(datetime(2026, 2, 23, 10, 0, 0), "bench", 155, 5, "felt good"),
                LiftRecord(datetime(2026, 2, 23, 10, 0, 0), "pullups", None, 8, ""),
            ]
            append_to_csv(path, records)
            parsed = parse_csv(path)

            assert len(parsed) == 2
            assert parsed[0].lift_name == "bench"
            assert parsed[0].weight == 155
            assert parsed[0].reps == 5
            assert parsed[1].lift_name == "pullups"
            assert parsed[1].reps == 8
        finally:
            os.unlink(path)
