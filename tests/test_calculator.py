"""Tests for the calculator page."""

import re

from app import app


def get_calculator_html():
    """Fetch the calculator page HTML via the test client."""
    with app.test_client() as client:
        resp = client.get("/calculator")
        assert resp.status_code == 200
        return resp.data.decode()


class TestCalculatorInputs:
    def test_weight_input_has_default_value(self):
        html = get_calculator_html()
        weight_input = re.search(r'<input[^>]*id="calc-weight"[^>]*>', html)
        assert weight_input, "Weight input not found"
        assert 'value="' in weight_input.group(), (
            "Weight input uses placeholder instead of value — "
            "Calculate button won't work without user input"
        )

    def test_reps_input_has_default_value(self):
        html = get_calculator_html()
        reps_input = re.search(r'<input[^>]*id="calc-reps"[^>]*>', html)
        assert reps_input, "Reps input not found"
        assert 'value="' in reps_input.group(), (
            "Reps input uses placeholder instead of value — "
            "Calculate button won't work without user input"
        )
