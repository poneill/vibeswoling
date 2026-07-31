# Pyramid Timer Integration

## Context

The standalone `~/pyramid_timer` project guides users through pyramid-style pullup sets (1, 2, 3, ..., N, ..., 3, 2, 1) with rest timers, a history sidebar, and a progress chart. We're integrating it into the weightlifting site so that when a user starts a pullup workout, they can choose between the existing freeform set entry and a guided pyramid flow. On completion, sets are logged to the CSV via `/api/log` like any other workout.

## Changes

### 1. Add choice modal on pullups history page

**Files:** `static/app.js`, `templates/history.html`

When "Start Workout" is clicked for pullups, show a modal with two options instead of navigating directly:
- **Regular Sets** → `/workout/pullups` (existing flow)
- **Pyramid Sets** → `/workout/pullups?mode=pyramid` (new flow)

In `initHistoryPage`, replace the direct navigation for pullups with a call to show this modal. Add the modal markup to `history.html` (only rendered when `is_pullups` is true).

### 2. Route the pyramid mode to a new template

**File:** `app.py`

In the existing `workout_page` route, check for `?mode=pyramid`. If present, render `pyramid.html` instead of `workout.html`.

### 3. Allow full-width body content in base template

**File:** `templates/base.html`

Wrap the `<main>` tag in a `{% block body_content %}...{% endblock %}` so the pyramid template can override the 700px-constrained container with its own 2-column layout. No change to existing templates (they inherit the default block).

### 4. Create the pyramid workout template

**New file:** `templates/pyramid.html`

Extends `base.html`, overrides `{% block body_content %}` with the 2-column layout:
- **Left sidebar:** History table (Reps, Total Reps, Volume, Cumulative) + canvas progress chart
- **Right main pane:** Three screens (setup → workout → done), stacked via show/hide

Setup screen fields: Max Reps, Rest Period (seconds), Bodyweight (lbs). No exercise name field (hardcoded to "pullups").

Done screen: "Complete Workout" button (replaces CSV download) + "Back" link.

### 5. Create pyramid JavaScript

**New file:** `static/pyramid.js`

Port the logic from `~/pyramid_timer/script.js` with these adaptations:
- Remove exercise name input handling (always "pullups")
- Replace `downloadCSV()` and "Start Over" with `completeWorkout()` that POSTs to `/api/log` with `{ sets: [{ lift_name: "pullups", reps: N, weight: null, notes: "" }, ...] }` and redirects to `/`
- Keep: `buildPyramid()`, `playChime()`, timer state machine, `renderHistory()`, `renderChart()`, setup summary, Space bar shortcut
- Wrap in an `initPyramidWorkout()` function (not an IIFE) so it can be called from the template script block

### 6. Create pyramid CSS

**New file:** `static/pyramid.css`

Port the layout from `~/pyramid_timer/style.css`, restyled to match the weightlifting site:
- Use Bootstrap CSS variables (`var(--bs-body-bg)`, `var(--bs-border-color)`, `var(--bs-secondary-color)`, etc.) instead of hardcoded earthy tones
- Use `#e94560` (red accent) for active states and the timer's "imminent" pulse
- Use `#4ecca3` (green accent) for success states
- Buttons use Bootstrap classes (`btn-danger`, `btn-success`, `btn-secondary`) via the template
- Keep the 2-column flex layout, sidebar dimensions, large rep counter, and chart styling

### Summary of files

| File | Action |
|------|--------|
| `templates/base.html` | Add `{% block body_content %}` wrapper |
| `templates/history.html` | Add pyramid choice modal (pullups only) |
| `templates/pyramid.html` | **New** — pyramid workout page |
| `static/app.js` | Show choice modal for pullups instead of direct nav |
| `static/pyramid.js` | **New** — pyramid timer logic |
| `static/pyramid.css` | **New** — pyramid layout + restyled visuals |
| `app.py` | Route `?mode=pyramid` to pyramid template |

## Verification

1. Run `uv run python app.py` and navigate to `/history/pullups`
2. Click "Start Workout" → modal appears with "Regular Sets" and "Pyramid Sets"
3. Click "Regular Sets" → existing pullup workflow (unchanged)
4. Click "Pyramid Sets" → pyramid page loads with setup form
5. Configure max reps / rest / bodyweight, click Start
6. Walk through pyramid: big rep counter, Done button / Space, rest timer, history table updates, chart draws
7. On final set → done screen with "Complete Workout" button
8. Click "Complete Workout" → sets logged, redirected to `/`
9. Verify sets appear in pullup history at `/history/pullups`
