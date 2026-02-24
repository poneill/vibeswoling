"""Flask application for the weightlifting workout logger."""

import os
from datetime import datetime

from flask import Flask, jsonify, render_template, request

from csv_parser import append_to_csv, parse_csv
from models import BAR_WEIGHTS, MAIN_LIFTS, LiftRecord, plates_for_weight
from onerm import effective_1rm, suggest_next, volume
from schedule import compute_suggestions, compute_weekly_status
from warmup import generate_workout

app = Flask(__name__)

CSV_PATH = os.path.expanduser("~/misc/lifts.csv")
RECORDS: list[LiftRecord] = []


def load_records():
    global RECORDS
    RECORDS = parse_csv(CSV_PATH)


load_records()


# --- Page routes ---


@app.route("/")
def index():
    """Landing page: lift selector with recent activity."""
    lift_summaries = []
    for lift in MAIN_LIFTS:
        recs = [r for r in RECORDS if r.lift_name == lift]
        if recs:
            last = recs[-1]
            lift_summaries.append(
                {
                    "name": lift,
                    "last_date": last.date.strftime("%b %d, %Y"),
                    "last_weight": last.weight,
                    "last_reps": last.reps,
                }
            )
        else:
            lift_summaries.append(
                {
                    "name": lift,
                    "last_date": None,
                    "last_weight": None,
                    "last_reps": None,
                }
            )
    return render_template("index.html", lifts=lift_summaries)


@app.route("/history/<lift_name>")
def history_page(lift_name: str):
    bar_weight = BAR_WEIGHTS.get(lift_name, 45)
    is_pullups = lift_name == "pullups"
    return render_template(
        "history.html",
        lift_name=lift_name,
        bar_weight=bar_weight,
        is_pullups=is_pullups,
    )


@app.route("/workout/<lift_name>")
def workout_page(lift_name: str):
    bar_weight = BAR_WEIGHTS.get(lift_name, 45)
    is_pullups = lift_name == "pullups"
    return render_template(
        "workout.html",
        lift_name=lift_name,
        bar_weight=bar_weight,
        is_pullups=is_pullups,
    )


@app.route("/calculator")
def calculator_page():
    return render_template("calculator.html")


# --- API routes ---


@app.route("/api/history/<lift_name>")
def api_history(lift_name: str):
    """Return JSON of all records for a given lift."""
    recs = [r for r in RECORDS if r.lift_name == lift_name]
    bar_weight = BAR_WEIGHTS.get(lift_name, 45)
    result = []
    for r in recs:
        orm = effective_1rm(r.weight, r.reps) if r.weight and r.reps else None
        vol = volume(r.weight, r.reps) if r.weight and r.reps else None
        result.append(
            {
                "date": r.date.isoformat(),
                "weight": r.weight,
                "reps": r.reps,
                "notes": r.notes,
                "orm": orm,
                "volume": vol,
                "plates": plates_for_weight(r.weight, bar_weight) if r.weight else None,
            }
        )
    return jsonify(result)


@app.route("/api/suggest/<lift_name>")
def api_suggest(lift_name: str):
    """Return the default next workout and alternatives."""
    recs = [r for r in RECORDS if r.lift_name == lift_name and r.weight and r.reps]
    bar_weight = BAR_WEIGHTS.get(lift_name, 45)

    if not recs:
        # No history — suggest starting with bar
        return jsonify(
            {
                "default": {
                    "weight": bar_weight,
                    "reps": 5,
                    "orm": effective_1rm(bar_weight, 5),
                    "plates": "bar",
                },
                "alternatives": [],
                "last": None,
            }
        )

    last = recs[-1]
    assert last.weight is not None and last.reps is not None
    suggestion = suggest_next(last.weight, last.reps, bar_weight)

    # Add plate info
    suggestion["default"]["plates"] = plates_for_weight(
        suggestion["default"]["weight"], bar_weight
    )
    for alt in suggestion["alternatives"]:
        alt["plates"] = plates_for_weight(alt["weight"], bar_weight)

    suggestion["last"] = {
        "weight": last.weight,
        "reps": last.reps,
        "orm": effective_1rm(last.weight, last.reps),
        "date": last.date.isoformat(),
    }

    return jsonify(suggestion)


@app.route("/api/warmup", methods=["POST"])
def api_warmup():
    """Given lift_name, weight, reps, num_sets, return full workout plan."""
    data = request.json
    lift_name = data["lift_name"]
    weight = float(data["weight"])
    reps = int(data["reps"])
    num_sets = int(data.get("num_sets", 3))
    bar_weight = BAR_WEIGHTS.get(lift_name, 45)

    sets = generate_workout(weight, reps, num_sets, bar_weight)
    result = []
    for s in sets:
        result.append(
            {
                "weight": s.weight,
                "reps": s.reps,
                "set_type": s.set_type,
                "rest_seconds": s.rest_seconds,
                "plates": plates_for_weight(s.weight, bar_weight),
                "orm": effective_1rm(s.weight, s.reps)
                if s.set_type == "work"
                else None,
                "volume": volume(s.weight, s.reps) if s.set_type == "work" else None,
            }
        )
    return jsonify(result)


@app.route("/api/alternatives", methods=["POST"])
def api_alternatives():
    """Given current weight/reps, return alternative (W', R') combos."""
    data = request.json
    lift_name = data["lift_name"]
    current_w = float(data["weight"])
    current_r = int(data["reps"])
    bar_weight = BAR_WEIGHTS.get(lift_name, 45)

    actual_r = data.get("actual_reps")

    suggestion = suggest_next(current_w, current_r, bar_weight)
    # Add plate info to alternatives
    for alt in suggestion["alternatives"]:
        alt["plates"] = plates_for_weight(alt["weight"], bar_weight)

    result = {"alternatives": suggestion["alternatives"]}
    if actual_r is not None:
        result["actual_orm"] = effective_1rm(current_w, int(actual_r))
    return jsonify(result)


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    """1RM calculator: given weight/reps, return ORM band and alternatives."""
    data = request.json
    weight = float(data["weight"])
    reps = int(data["reps"])
    bar_weight = float(data.get("bar_weight", 45))

    current_orm = effective_1rm(weight, reps)
    suggestion = suggest_next(weight, reps, bar_weight)

    suggestion["default"]["plates"] = plates_for_weight(
        suggestion["default"]["weight"], bar_weight
    )
    for alt in suggestion["alternatives"]:
        alt["plates"] = plates_for_weight(alt["weight"], bar_weight)

    return jsonify(
        {
            "current_orm": current_orm,
            "target_orm": suggestion["default"]["orm"],
            "default": suggestion["default"],
            "alternatives": suggestion["alternatives"],
            "input": {
                "weight": weight,
                "reps": reps,
                "plates": plates_for_weight(weight, bar_weight),
            },
        }
    )


@app.route("/api/log", methods=["POST"])
def api_log():
    """Append completed workout sets to the CSV."""
    data = request.json
    records = []
    now = datetime.now()
    for entry in data["sets"]:
        records.append(
            LiftRecord(
                date=now,
                lift_name=entry["lift_name"],
                weight=entry.get("weight"),
                reps=entry.get("reps"),
                notes=entry.get("notes", ""),
            )
        )

    append_to_csv(CSV_PATH, records)
    load_records()  # Refresh in-memory state
    return jsonify({"status": "ok", "count": len(records)})


@app.route("/api/today")
def api_today():
    """Return weekly checklist status and today's suggestions."""
    status = compute_weekly_status(RECORDS)
    suggestions = compute_suggestions(RECORDS)
    return jsonify({"status": status, "suggestions": suggestions})


@app.route("/api/plates")
def api_plates():
    """Utility: decompose a weight into plates."""
    weight = float(request.args["weight"])
    bar = float(request.args.get("bar", 45))
    return jsonify({"plates": plates_for_weight(weight, bar)})


if __name__ == "__main__":
    app.run(debug=True, port=5050)
