/* Core UI logic: index page, history page, workout page state machine, timers. */

// === Index Page (Weekly Checklist + Suggestions) ===

function initIndexPage() {
    fetch("/api/today")
        .then(r => r.json())
        .then(data => {
            renderWeekChecklist(data.status);
            renderTodaySuggestions(data.suggestions);
        });
}

function renderWeekChecklist(status) {
    const container = document.getElementById("week-checklist");
    const countEl = document.getElementById("week-count");

    countEl.textContent = `${status.done_total} of ${status.target_total}`;

    const categoryLabels = {
        squat: "Squat",
        deadlift: "Deadlift",
        bench: "Bench",
        ohp: "OHP",
        pullups: "Pullups",
    };

    for (const [cat, info] of Object.entries(status.categories)) {
        const label = categoryLabels[cat] || cat;

        if (cat === "pullups") {
            // Pullups needs 2x — show as "Pullups (1/2)" or checkmark
            const done = info.done;
            const target = info.target;
            const complete = done >= target;
            const el = document.createElement("span");
            el.className = complete ? "text-success fw-semibold" : "text-secondary";
            el.innerHTML = complete
                ? `<span class="text-success">&#10003;</span> ${label}`
                : `<span class="text-secondary">&middot;</span> ${label} (${done}/${target})`;
            container.appendChild(el);
        } else {
            const complete = info.done >= info.target;
            const el = document.createElement("span");
            el.className = complete ? "text-success fw-semibold" : "text-secondary";
            el.innerHTML = complete
                ? `<span class="text-success">&#10003;</span> ${label}`
                : `<span class="text-secondary">&middot;</span> ${label}`;
            container.appendChild(el);
        }
    }
}

function renderTodaySuggestions(suggestions) {
    const container = document.getElementById("today-suggestions");

    if (suggestions.length === 0) {
        container.innerHTML = '<p class="text-success">All done this week!</p>';
        return;
    }

    suggestions.forEach(s => {
        const card = document.createElement("a");
        card.href = `/history/${encodeURIComponent(s.lift_name)}`;
        card.className = "card bg-dark border-secondary text-decoration-none mb-2 lift-card";

        let detailHtml = "";
        if (s.last_date) {
            if (s.last_weight && s.last_reps) {
                detailHtml = `Last: ${s.last_date} &middot; ${Math.round(s.last_weight)} lbs &times; ${s.last_reps}`;
            } else if (s.last_weight) {
                detailHtml = `Last: ${s.last_date} &middot; ${Math.round(s.last_weight)} lbs`;
            } else if (s.last_reps) {
                detailHtml = `Last: ${s.last_date} &middot; ${s.last_reps} reps`;
            } else {
                detailHtml = `Last: ${s.last_date}`;
            }
        } else {
            detailHtml = "No history yet";
        }

        let suggestHtml = "";
        if (s.suggestion) {
            const d = s.suggestion.default;
            suggestHtml = `<span class="text-light">Next: ${Math.round(d.weight)} lbs &times; ${d.reps}</span>`;
        }

        card.innerHTML = `
            <div class="card-body d-flex justify-content-between align-items-center">
                <div>
                    <h5 class="card-title text-capitalize text-light mb-1">${s.lift_name}</h5>
                    <p class="card-text text-secondary small mb-0">${detailHtml}</p>
                    ${suggestHtml ? `<p class="card-text small mb-0 mt-1">${suggestHtml}</p>` : ""}
                </div>
                <span class="btn btn-outline-danger btn-sm">Start</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// === History Page ===

function initHistoryPage(liftName, barWeight, isPullups) {
    fetch(`/api/history/${encodeURIComponent(liftName)}`)
        .then(r => r.json())
        .then(data => {
            populateHistoryTable(data, isPullups);
            if (!isPullups) {
                renderTemporalChart(data, "#temporal-chart");
                renderIsoclineChart(data, "#isocline-chart");
            }
        });

    document.getElementById("start-workout-btn").addEventListener("click", () => {
        if (isPullups) {
            window.location.href = `/workout/${encodeURIComponent(liftName)}`;
            return;
        }
        showSuggestionModal(liftName);
    });
}

function populateHistoryTable(data, isPullups) {
    const tbody = document.querySelector("#history-table tbody");
    // Show newest first
    const reversed = [...data].reverse();

    // Group by date to show session separators
    let lastDate = null;
    reversed.forEach(d => {
        const row = document.createElement("tr");
        const dateStr = new Date(d.date).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric"
        });

        if (isPullups) {
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${d.reps ?? "-"}</td>
                <td>${d.notes || ""}</td>
            `;
        } else {
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${d.weight ? d.weight + " lbs" : "-"}</td>
                <td>${d.reps ?? "-"}</td>
                <td>${d.orm ? d.orm.toFixed(1) : "-"}</td>
                <td>${d.volume ?? "-"}</td>
                <td>${d.notes || ""}</td>
            `;
        }
        tbody.appendChild(row);
    });
}

// === Suggestion Modal ===

let suggestionData = null;
let suggestionLift = null;
let suggestionSort = "orm"; // default sort key
let suggestionAsc = true;   // true = ascending, false = descending

function showSuggestionModal(liftName) {
    const modal = document.getElementById("suggestion-modal");
    const body = document.getElementById("suggestion-body");
    body.innerHTML = "Loading...";
    modal.classList.remove("hidden");

    fetch(`/api/suggest/${encodeURIComponent(liftName)}`)
        .then(r => r.json())
        .then(data => {
            suggestionData = data;
            suggestionLift = liftName;
            suggestionSort = "orm";
            suggestionAsc = true;
            renderSuggestionModal();
        });
}

function renderSuggestionModal() {
    const body = document.getElementById("suggestion-body");
    body.innerHTML = "";
    const data = suggestionData;
    const liftName = suggestionLift;

    if (data.last) {
        const lastInfo = document.createElement("p");
        lastInfo.style.color = "#999";
        lastInfo.style.marginBottom = "12px";
        lastInfo.style.fontSize = "0.9rem";
        const lastDate = new Date(data.last.date).toLocaleDateString("en-US", {
            month: "short", day: "numeric"
        });
        lastInfo.textContent = `Last: ${data.last.weight} lbs × ${data.last.reps} (1RM: ${data.last.orm.toFixed(1)}) on ${lastDate}`;
        body.appendChild(lastInfo);
    }

    // Default suggestion
    const defBtn = createSuggestionButton(data.default, liftName, true);
    body.appendChild(defBtn);

    if (data.alternatives.length > 0) {
        // Sort bar
        const sortBar = document.createElement("div");
        sortBar.className = "sort-bar";
        const sorts = [
            { key: "weight", label: "Weight" },
            { key: "reps", label: "Reps" },
            { key: "orm", label: "1RM" },
            { key: "volume", label: "Volume" },
        ];
        sorts.forEach(s => {
            const btn = document.createElement("button");
            const isActive = suggestionSort === s.key;
            btn.className = "sort-btn" + (isActive ? " sort-active" : "");
            const arrow = isActive ? (suggestionAsc ? " \u25b2" : " \u25bc") : "";
            btn.textContent = s.label + arrow;
            btn.addEventListener("click", () => {
                if (suggestionSort === s.key) {
                    suggestionAsc = !suggestionAsc;
                } else {
                    suggestionSort = s.key;
                    suggestionAsc = true;
                }
                renderSuggestionModal();
            });
            sortBar.appendChild(btn);
        });
        body.appendChild(sortBar);

        // Sort alternatives
        const dir = suggestionAsc ? 1 : -1;
        const sorted = [...data.alternatives].sort((a, b) => {
            let av, bv;
            if (suggestionSort === "volume") {
                av = a.weight * a.reps;
                bv = b.weight * b.reps;
            } else {
                av = a[suggestionSort];
                bv = b[suggestionSort];
            }
            return (av - bv) * dir;
        });

        sorted.forEach(alt => {
            body.appendChild(createSuggestionButton(alt, liftName, false));
        });
    }
}

const DEFAULT_NUM_SETS = 3;

function createSuggestionButton(option, liftName, isDefault) {
    const btn = document.createElement("button");
    btn.className = "suggestion-option" + (isDefault ? " suggestion-default" : "");
    const totalVol = option.weight * option.reps * DEFAULT_NUM_SETS;
    btn.innerHTML = `
        <div class="so-main">${option.weight} lbs × ${option.reps} × ${DEFAULT_NUM_SETS} sets</div>
        <div class="so-detail">Est. 1RM: ${option.orm.toFixed(1)} lbs · Vol: ${totalVol}</div>
    `;
    btn.addEventListener("click", () => {
        window.location.href = `/workout/${encodeURIComponent(liftName)}?w=${option.weight}&r=${option.reps}&sets=${DEFAULT_NUM_SETS}`;
    });
    return btn;
}

function closeSuggestionModal() {
    document.getElementById("suggestion-modal").classList.add("hidden");
}


// === Workout Page ===

let workoutState = {
    sets: [],           // array of {weight, reps, set_type, plates, orm, volume, rest_seconds, status}
    currentIndex: 0,
    cumulativeVolume: 0,
    completedSets: [],  // for logging
    liftName: "",
    isPullups: false,
};

let timerInterval = null;
let timerTarget = null;

function initWorkoutPage(liftName, workWeight, workReps, numSets, barWeight, isPullups) {
    workoutState.liftName = liftName;
    workoutState.isPullups = isPullups;

    if (isPullups) {
        initPullupsWorkout(liftName, numSets);
        return;
    }

    // Show target
    document.getElementById("workout-target").textContent =
        `Target: ${workWeight} lbs × ${workReps}`;

    // Fetch warmup + work sets from API
    fetch("/api/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lift_name: liftName, weight: workWeight, reps: workReps, num_sets: numSets }),
    })
        .then(r => r.json())
        .then(sets => {
            workoutState.sets = sets.map(s => ({ ...s, status: "pending" }));
            renderWorkoutSets();
            activateSet(0);
        });
}

function initPullupsWorkout(liftName, numSets) {
    document.getElementById("workout-target").textContent = "Log your pullup sets";

    // For pullups: dynamic set entry, no predetermined sets
    workoutState.sets = [];
    const container = document.getElementById("workout-sets");
    container.innerHTML = "";

    function addPullupSet() {
        const idx = workoutState.sets.length;
        workoutState.sets.push({ reps: null, set_type: "work", status: "pending" });

        const card = document.createElement("div");
        card.className = "set-card active";
        card.id = `set-${idx}`;
        card.innerHTML = `
            <div class="set-header">
                <span class="set-type">Set ${idx + 1}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
                <input type="number" class="reps-input" id="pullup-reps-${idx}"
                       placeholder="0" min="0" max="99" inputmode="numeric">
                <span class="set-reps">reps</span>
                <button class="btn btn-success btn-small" onclick="logPullupSet(${idx})">Done</button>
            </div>
        `;
        container.appendChild(card);

        // Focus the input
        setTimeout(() => document.getElementById(`pullup-reps-${idx}`).focus(), 100);
    }

    addPullupSet();

    // Show complete button with add-set ability
    const actions = document.getElementById("workout-actions");
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-secondary";
    addBtn.textContent = "Add Set";
    addBtn.addEventListener("click", addPullupSet);
    actions.insertBefore(addBtn, actions.firstChild);

    document.getElementById("complete-btn").classList.remove("hidden");
}

// Exposed globally for onclick
window.logPullupSet = function(idx) {
    const input = document.getElementById(`pullup-reps-${idx}`);
    const reps = parseInt(input.value);
    if (isNaN(reps) || reps <= 0) return;

    workoutState.sets[idx].reps = reps;
    workoutState.sets[idx].status = "completed";
    workoutState.completedSets.push({
        lift_name: workoutState.liftName,
        reps: reps,
        weight: null,
        notes: "",
    });

    const card = document.getElementById(`set-${idx}`);
    card.className = "set-card completed";
    card.innerHTML = `
        <div class="set-header">
            <span class="set-type">Set ${idx + 1}</span>
            <span class="set-reps">${reps} reps</span>
        </div>
    `;
};

function renderWorkoutSets() {
    const container = document.getElementById("workout-sets");
    container.innerHTML = "";

    workoutState.sets.forEach((s, idx) => {
        const card = document.createElement("div");
        card.className = "set-card";
        card.id = `set-${idx}`;

        let statsHtml = "";
        if (s.set_type === "work") {
            statsHtml = `<div class="set-stats">
                1RM: ${s.orm ? s.orm.toFixed(1) : "-"} &middot;
                Vol: ${s.volume ?? "-"} &middot;
                Cumul: <span id="cumul-${idx}">-</span>
            </div>`;
        }

        card.innerHTML = `
            <div class="set-header">
                <span class="set-type">${s.set_type}</span>
                <div>
                    <span class="set-weight">${s.weight} lbs</span>
                    <span class="set-plates">(${s.plates})</span>
                </div>
            </div>
            <div class="set-reps">${s.reps} reps</div>
            ${statsHtml}
            <div class="set-actions" id="actions-${idx}"></div>
        `;
        container.appendChild(card);
    });
}

function activateSet(idx) {
    if (idx >= workoutState.sets.length) {
        // All sets done
        document.getElementById("complete-btn").classList.remove("hidden");
        return;
    }

    workoutState.currentIndex = idx;
    const card = document.getElementById(`set-${idx}`);
    card.classList.add("active");

    const actions = document.getElementById(`actions-${idx}`);
    const s = workoutState.sets[idx];

    if (s.set_type === "work") {
        const doneBtn = document.createElement("button");
        doneBtn.className = "btn btn-success btn-small";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", () => recordWorkSet(idx, s.reps, false));
        actions.appendChild(doneBtn);

        const editBtn = document.createElement("button");
        editBtn.className = "btn btn-warning btn-small";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => promptActualReps(idx));
        actions.appendChild(editBtn);
    } else {
        const doneBtn = document.createElement("button");
        doneBtn.className = "btn btn-success btn-small";
        doneBtn.textContent = "Done";
        doneBtn.addEventListener("click", () => completeSet(idx));
        actions.appendChild(doneBtn);
    }

    // Scroll to active set
    card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function completeSet(idx) {
    const s = workoutState.sets[idx];
    s.status = "completed";

    const card = document.getElementById(`set-${idx}`);
    card.classList.remove("active");
    card.classList.add("completed");
    document.getElementById(`actions-${idx}`).innerHTML = "";

    advanceAfterSet(idx);
}

function advanceAfterSet(idx) {
    const s = workoutState.sets[idx];
    if (s.rest_seconds && idx < workoutState.sets.length - 1) {
        startTimer(s.rest_seconds, () => activateSet(idx + 1));
    } else {
        activateSet(idx + 1);
    }
}

function promptActualReps(idx) {
    const s = workoutState.sets[idx];
    const modal = document.getElementById("failed-modal");
    const body = document.getElementById("failed-alternatives");
    body.innerHTML = `
        <p style="color: #999; margin-bottom: 12px; font-size: 0.9rem;">
            Planned: ${s.weight} lbs × ${s.reps}
        </p>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <span style="color: #ccc;">Reps completed:</span>
            <input type="number" class="reps-input" id="actual-reps-input"
                   placeholder="${s.reps}" min="0" max="99" inputmode="numeric">
            <button class="btn btn-success btn-small" id="actual-reps-confirm">Log</button>
        </div>
    `;
    modal.classList.remove("hidden");
    setTimeout(() => {
        const input = document.getElementById("actual-reps-input");
        input.focus();
        input.select();
    }, 100);

    document.getElementById("actual-reps-confirm").addEventListener("click", () => {
        const actualReps = parseInt(document.getElementById("actual-reps-input").value);
        if (isNaN(actualReps) || actualReps <= 0) return;
        modal.classList.add("hidden");
        recordWorkSet(idx, actualReps, true);
    });
}

function recordWorkSet(idx, actualReps, offerAlternatives) {
    const s = workoutState.sets[idx];
    s.status = "completed";

    const card = document.getElementById(`set-${idx}`);
    card.classList.remove("active");
    card.classList.add("completed");
    document.getElementById(`actions-${idx}`).innerHTML = "";

    // Update displayed reps if different from planned
    if (actualReps !== s.reps) {
        const repsEl = card.querySelector(".set-reps");
        if (repsEl) repsEl.textContent = `${actualReps} reps (planned ${s.reps})`;
    }

    // Log to completedSets
    const notes = actualReps < s.reps ? `${actualReps}/${s.reps}` : "";
    workoutState.cumulativeVolume += s.weight * actualReps;
    const cumulEl = document.getElementById(`cumul-${idx}`);
    if (cumulEl) cumulEl.textContent = workoutState.cumulativeVolume;

    workoutState.completedSets.push({
        lift_name: workoutState.liftName,
        weight: s.weight,
        reps: actualReps,
        notes: notes,
    });

    advanceAfterSet(idx);

    if (offerAlternatives) {
        const hasRemaining = workoutState.sets.some(
            (set, i) => i > idx && set.set_type === "work" && set.status === "pending"
        );
        if (hasRemaining) {
            fetchAlternatives(idx, s, actualReps);
        }
    }
}

function fetchAlternatives(completedIdx, s, actualReps) {
    fetch("/api/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            lift_name: workoutState.liftName,
            weight: s.weight,
            reps: s.reps,
            actual_reps: actualReps,
        }),
    })
        .then(r => r.json())
        .then(data => {
            if (data.alternatives.length === 0) return;
            showAlternativesModal(data.alternatives, completedIdx, s, actualReps, data.actual_orm);
        });
}

function showAlternativesModal(alternatives, completedIdx, plannedSet, actualReps, actualOrm) {
    const modal = document.getElementById("failed-modal");
    const body = document.getElementById("failed-alternatives");
    body.innerHTML = "";

    const diff = actualReps - plannedSet.reps;
    const diffLabel = diff > 0 ? `+${diff} reps — nice!` : `${diff} reps`;
    const diffColor = diff > 0 ? "var(--bs-success, #198754)" : "var(--warning, #ffc107)";

    const context = document.createElement("div");
    context.style.cssText = "margin-bottom: 16px; font-size: 0.9rem;";
    context.innerHTML = `
        <p style="color: #666; margin: 0 0 4px;">Planned: ${plannedSet.weight} lbs × ${plannedSet.reps} · 1RM: ${plannedSet.orm.toFixed(1)}</p>
        <p style="color: #ccc; margin: 0 0 4px;">Actual: ${plannedSet.weight} lbs × ${actualReps} · 1RM: ${actualOrm.toFixed(1)}</p>
        <p style="color: ${diffColor}; margin: 0; font-weight: 600;">${diffLabel}</p>
    `;
    body.appendChild(context);

    const label = document.createElement("p");
    label.style.color = "#666";
    label.style.margin = "0 0 8px";
    label.style.fontSize = "0.8rem";
    label.textContent = "ADJUST REMAINING SETS?";
    body.appendChild(label);

    alternatives.forEach(alt => {
        const btn = document.createElement("button");
        btn.className = "suggestion-option";
        btn.innerHTML = `
            <div class="so-main">${alt.weight} lbs × ${alt.reps}</div>
            <div class="so-detail">Est. 1RM: ${alt.orm.toFixed(1)} lbs</div>
        `;
        btn.addEventListener("click", () => {
            updateRemainingWorkSets(completedIdx, alt);
            modal.classList.add("hidden");
        });
        body.appendChild(btn);
    });

    modal.classList.remove("hidden");
}

function updateRemainingWorkSets(afterIdx, alt) {
    for (let i = afterIdx + 1; i < workoutState.sets.length; i++) {
        const set = workoutState.sets[i];
        if (set.set_type === "work" && set.status === "pending") {
            set.weight = alt.weight;
            set.reps = alt.reps;
            set.orm = alt.orm;
            set.volume = alt.weight * alt.reps;
            set.plates = alt.plates;
        }
    }
    renderWorkoutSets();
    // Re-mark completed sets
    for (let i = 0; i <= afterIdx; i++) {
        const st = workoutState.sets[i];
        const card = document.getElementById(`set-${i}`);
        if (st.status === "completed") card.classList.add("completed");
    }
}

function closeFailedModal() {
    document.getElementById("failed-modal").classList.add("hidden");
}

// === Timer ===

function startTimer(seconds, onComplete) {
    const display = document.getElementById("timer-display");
    const timeEl = document.getElementById("timer-time");
    const skipBtn = document.getElementById("timer-skip");

    display.classList.remove("hidden", "done");
    timerTarget = Date.now() + seconds * 1000;

    function update() {
        const remaining = Math.max(0, timerTarget - Date.now());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timeEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            display.classList.add("done");
            timeEl.textContent = "GO!";
            // Auto-hide after 3 seconds
            setTimeout(() => {
                display.classList.add("hidden");
                onComplete();
            }, 3000);
        }
    }

    update();
    clearInterval(timerInterval);
    timerInterval = setInterval(update, 250);

    // Skip button
    skipBtn.onclick = () => {
        clearInterval(timerInterval);
        display.classList.add("hidden");
        onComplete();
    };
}

// === Complete Workout ===

function completeWorkout() {
    const notes = document.getElementById("workout-notes").value.trim();

    // Add notes to all completed sets
    if (notes) {
        workoutState.completedSets.forEach(s => s.notes = notes);
    }

    if (workoutState.completedSets.length === 0) {
        alert("No sets completed!");
        return;
    }

    fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sets: workoutState.completedSets }),
    })
        .then(r => r.json())
        .then(data => {
            if (data.status === "ok") {
                window.location.href = "/";
            }
        })
        .catch(err => {
            alert("Error saving workout: " + err.message);
        });
}

// === Calculator Page ===

function initCalculatorPage() {
    const btn = document.getElementById("calc-btn");
    const weightInput = document.getElementById("calc-weight");
    const repsInput = document.getElementById("calc-reps");
    const barSelect = document.getElementById("calc-bar");

    btn.addEventListener("click", () => {
        const weight = parseFloat(weightInput.value);
        const reps = parseInt(repsInput.value);
        const barWeight = parseFloat(barSelect.value);
        if (!weight || !reps || reps < 1) return;
        fetchCalculation(weight, reps, barWeight);
    });
}

function fetchCalculation(weight, reps, barWeight) {
    fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight, reps, bar_weight: barWeight }),
    })
        .then(r => r.json())
        .then(data => {
            renderCalcResult(data);
            renderCalcChart(data);
            renderCalcAlternatives(data);
        });
}

function renderCalcResult(data) {
    const el = document.getElementById("calc-result");
    el.classList.remove("hidden");
    el.innerHTML = `
        <div class="d-flex gap-4">
            <div>
                <span class="text-secondary small">Current 1RM</span>
                <div class="fs-4 fw-bold">${data.current_orm.toFixed(1)} lbs</div>
                <span class="text-secondary small">${data.input.weight} lbs × ${data.input.reps} (${data.input.plates})</span>
            </div>
            <div>
                <span class="text-secondary small">Target 1RM</span>
                <div class="fs-4 fw-bold" style="color: #4ecca3;">${data.target_orm.toFixed(1)} lbs</div>
                <span class="text-secondary small">${data.default.weight} lbs × ${data.default.reps} (${data.default.plates})</span>
            </div>
        </div>
    `;
}

function renderCalcChart(data) {
    const container = document.getElementById("calc-chart-container");
    container.classList.remove("hidden");
    const chartEl = document.getElementById("calc-chart");
    chartEl.innerHTML = "";
    renderCalculatorChart(data, "#calc-chart");
}

function renderCalcAlternatives(data) {
    const section = document.getElementById("calc-alternatives");
    const list = document.getElementById("calc-alt-list");
    list.innerHTML = "";

    const allOptions = [data.default, ...data.alternatives];
    if (allOptions.length === 0) {
        section.classList.add("hidden");
        return;
    }

    section.classList.remove("hidden");

    // Default first (highlighted)
    list.appendChild(createCalcOption(data.default, true));

    data.alternatives.forEach(alt => {
        list.appendChild(createCalcOption(alt, false));
    });
}

function createCalcOption(option, isDefault) {
    const btn = document.createElement("div");
    btn.className = "suggestion-option" + (isDefault ? " suggestion-default" : "");
    btn.innerHTML = `
        <div class="so-main">${option.weight} lbs × ${option.reps} (${option.plates})</div>
        <div class="so-detail">Est. 1RM: ${option.orm.toFixed(1)} lbs</div>
    `;
    return btn;
}

// Expose for onclick in template
window.completeWorkout = completeWorkout;
window.closeSuggestionModal = closeSuggestionModal;
window.closeFailedModal = closeFailedModal;
