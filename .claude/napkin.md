# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-03-10] Run tests with `uv run pytest`, lint with `uv run ruff check .`**
   Do instead: always use `uv run` prefix for Python tooling — never bare pytest/ruff.
2. **[2026-03-10] App runs on port 5050 (`uv run python app.py`)**
   Do instead: use `localhost:5050` for any manual testing or curl checks.
3. **[2026-03-10] Data lives in CSV (`~/misc/lifts.csv`), not a database**
   Do instead: test data changes via CSV fixtures, be aware of file mtime staleness checks.

## Shell & Command Reliability
1. **[2026-03-10] Use `uv run` for all Python commands**
   Do instead: `uv run pytest`, `uv run ruff check .`, `uv run python app.py`.

## Domain Behavior Guardrails
1. **[2026-03-11] Pullups use `bw:NNN` CSV notation for weighted sets**
   Do instead: when modifying pullup parsing, preserve backward compat — rows without `bw:` are legacy reps-only format.
2. **[2026-03-10] CSV parser normalizes lift abbreviations (dl → deadlift, etc.)**
   Do instead: check `csv_parser.py` and `models.py` for canonical lift names before adding new lifts.
3. **[2026-03-11] Pullups have different data shape than barbell lifts**
   Do instead: check `is_pullups` / `bodyweight` paths in app.py, app.js, and csv_parser.py when touching lift logic.
4. **[2026-03-10] Weekly schedule uses staleness ranking to suggest next lifts**
   Do instead: understand `schedule.py` staleness logic before modifying suggestions.
5. **[2026-03-10] External CSV edits detected via file mtime**
   Do instead: account for mtime-based cache invalidation when changing data flow.

## Architecture Notes
1. **[2026-03-10] Flask app with vanilla JS frontend (no framework), D3.js for charts**
   Do instead: keep JS vanilla, don't introduce React/Vue/etc.
2. **[2026-03-10] Business logic is modular: warmup.py, onerm.py, schedule.py separate from routes**
   Do instead: keep route handlers thin, put logic in dedicated modules.
3. **[2026-03-10] Templates: Jinja2 in templates/, static JS/CSS in static/**
   Do instead: follow existing template/static split for new pages.
