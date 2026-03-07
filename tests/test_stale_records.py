"""Test that /api/today reflects CSV changes made outside the app."""

from datetime import datetime

import pytest

from app import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create a test client with a temp CSV file."""
    csv_file = tmp_path / "lifts.csv"
    # Seed with a squat record in the current week
    now = datetime.now()
    date_str = now.strftime("%a %b %e %H:%M:%S EST %Y")
    csv_file.write_text(f"{date_str}, squat, 185, 5, test\n")

    monkeypatch.setattr("app.CSV_PATH", str(csv_file))

    # Force initial load with the temp file
    import app as app_module

    app_module.CSV_PATH = str(csv_file)
    app_module.load_records()

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c, csv_file


def test_api_today_sees_external_csv_append(client):
    """After appending a deadlift to the CSV externally, /api/today should
    show deadlift as completed without going through /api/log."""
    c, csv_file = client

    # Verify deadlift is NOT completed yet
    resp = c.get("/api/today")
    data = resp.get_json()
    assert data["status"]["categories"]["deadlift"]["done"] == 0

    # Simulate external CSV edit (user manually appends a deadlift)
    now = datetime.now()
    date_str = now.strftime("%a %b %e %H:%M:%S EST %Y")
    with open(csv_file, "a") as f:
        f.write(f"{date_str}, dl, 275, 5, pause dls\n")

    # Fetch again — should now show deadlift as completed
    resp = c.get("/api/today")
    data = resp.get_json()
    assert data["status"]["categories"]["deadlift"]["done"] == 1
