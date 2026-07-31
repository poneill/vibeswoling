"""Test that Done/Edit buttons don't appear twice during a workout.

Reproduces a race condition in the rest timer: when the timer hits zero,
a 3-second setTimeout is queued to call activateSet. If the user clicks
Skip during the "GO!" display, activateSet fires immediately — and then
the pending setTimeout fires it again, appending duplicate buttons.
"""

import subprocess
import time

import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="module")
def dev_server():
    proc = subprocess.Popen(
        ["uv", "run", "flask", "run", "--port", "5099"],
        cwd="/Users/pat/weightlifting_site",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(2)
    yield "http://127.0.0.1:5099"
    proc.terminate()
    proc.wait()


def test_skip_during_go_does_not_duplicate_buttons(dev_server: str, page: Page):
    """Clicking Skip while the timer shows 'GO!' should not double the buttons."""
    page.goto(f"{dev_server}/workout/dl?w=225&r=5&sets=3")
    page.wait_for_selector(".set-card.active")

    # Click Done through warmup sets until a rest timer appears.
    # Early warmups have no rest and advance instantly; the last warmup
    # has rest_seconds=120, which starts the timer.
    while True:
        active = page.locator(".set-card.active")
        active.locator(".set-actions button", has_text="Done").click()

        timer = page.locator("#timer-display")
        if not timer.evaluate("el => el.classList.contains('hidden')"):
            break

        page.wait_for_selector(".set-card.active")

    # Timer is running. Fast-forward it so the next interval tick triggers
    # the "GO!" state (and its 3-second setTimeout).
    page.evaluate("timerTarget = Date.now() - 1000")
    page.locator("#timer-time").filter(has_text="GO!").wait_for()

    # Click Skip while "GO!" is displayed. This calls onComplete() immediately.
    # The pending 3-second setTimeout will call onComplete() again later.
    page.locator("#timer-skip").click()

    # The next set after the last warmup is a work set (Done + Edit = 2 buttons).
    active_card = page.locator(".set-card.active")
    expect(active_card).to_have_count(1)
    active_actions = active_card.locator(".set-actions")

    # Wait for the orphaned setTimeout (3s) to fire
    page.wait_for_timeout(4000)

    # BUG: the stale setTimeout calls activateSet a second time, doubling the
    # buttons from 2 (Done, Edit) to 4 (Done, Edit, Done, Edit).
    expect(active_actions.locator("button")).to_have_count(2)
