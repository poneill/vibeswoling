# Weightlifting Tracker

A personal workout logger and planning tool for barbell training. Reads and writes a plain-text CSV file, generates warmup plans, tracks progressive overload, and nudges you toward weekly consistency.

## Features

- **Workout logging** -- log sets from the browser; data appends to a flat CSV (`~/misc/lifts.csv`)
- **History and charts** -- D3.js visualizations of estimated 1RM and volume over time for each lift
- **Warmup generation** -- plate-math-aware warmup sets using only 45s and 25s, with configurable bar weights
- **Progressive overload** -- suggests your next weight/rep target based on your last session (Epley/Brzycki/Lombardi average)
- **Weekly planning** -- a checklist of 5 lift categories (squat, deadlift, bench, OHP, pullups) with "today" suggestions ranked by staleness
- **Plate calculator** -- shows the plate breakdown per side for any weight

### Supported lifts

| Category | Lifts | Bar weight |
|----------|-------|-----------|
| Squat | barbell squat, front squat, safety bar squat | 45 / 45 / 65 lb |
| Deadlift | deadlift, hex bar deadlift | 45 / 65 lb |
| Bench | bench | 45 lb |
| OHP | overhead press | 45 lb |
| Pullups | pullups (bodyweight) | -- |

The CSV parser recognizes common abbreviations (`dl`, `bs`, `ohp`, `sbs`, `fs`, `hdl`, etc.) and normalizes them to canonical names.

## Requirements

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

## Installation

```bash
git clone https://github.com/poneill/weightlifting_site.git
cd weightlifting_site
uv sync
```

## Usage

```bash
uv run python app.py
```

The app runs at [http://localhost:5050](http://localhost:5050).

### Data file

The app reads from and writes to `~/misc/lifts.csv`. Each row is a comma-separated record:

```
Mon Feb 10 18:30:00 EST 2025, bench, 150, 5
Tue Feb 11 19:00:00 EST 2025, dl, 295, 5, felt good
Wed Feb 12 07:00:00 EST 2025, pullups, 8
```

Format: `date, lift_name, [weight], reps, [notes]`

Bodyweight lifts (pullups) omit the weight field. Notes are optional.

## Development

Install dev dependencies:

```bash
uv sync --dev
```

### Tests

```bash
uv run pytest
```

With coverage:

```bash
uv run pytest --cov=. --cov-report=term-missing
```

### Linting and type checking

```bash
uv run ruff check .
uv run ruff format .
uv run ty check
```

## Project structure

```
app.py           Flask routes and API endpoints
models.py        Data models, lift config, plate math
csv_parser.py    CSV parsing and writing
warmup.py        Warmup set generation algorithm
onerm.py         1RM estimation and progressive overload
schedule.py      Weekly planning and suggestions
templates/       Jinja2 HTML templates
static/          JS (app.js, charts.js) and CSS
tests/           pytest suite
```

## License

Personal project. No license specified.
