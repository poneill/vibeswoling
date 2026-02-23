/* Core UI logic: history page interactions, workout page state machine, timers. */

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

    const doneBtn = document.createElement("button");
    doneBtn.className = "btn btn-success btn-small";
    doneBtn.textContent = "Done";
    doneBtn.addEventListener("click", () => completeSet(idx, true));
    actions.appendChild(doneBtn);

    if (s.set_type === "work") {
        const failBtn = document.createElement("button");
        failBtn.className = "btn btn-warning btn-small";
        failBtn.textContent = "Failed";
        failBtn.addEventListener("click", () => promptFailedReps(idx));
        actions.appendChild(failBtn);
    }

    // Scroll to active set
    card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function completeSet(idx, success) {
    const s = workoutState.sets[idx];
    s.status = success ? "completed" : "failed";

    const card = document.getElementById(`set-${idx}`);
    card.classList.remove("active");
    card.classList.add(success ? "completed" : "failed");

    // Clear actions
    document.getElementById(`actions-${idx}`).innerHTML = "";

    // Track for logging (only work sets)
    if (s.set_type === "work" && success) {
        workoutState.cumulativeVolume += (s.volume || 0);
        const cumulEl = document.getElementById(`cumul-${idx}`);
        if (cumulEl) cumulEl.textContent = workoutState.cumulativeVolume;

        workoutState.completedSets.push({
            lift_name: workoutState.liftName,
            weight: s.weight,
            reps: s.reps,
            notes: "",
        });
    }

    // Start rest timer if applicable
    if (s.rest_seconds && idx < workoutState.sets.length - 1) {
        startTimer(s.rest_seconds, () => activateSet(idx + 1));
    } else {
        activateSet(idx + 1);
    }
}

function promptFailedReps(idx) {
    const s = workoutState.sets[idx];
    const modal = document.getElementById("failed-modal");
    const body = document.getElementById("failed-alternatives");
    body.innerHTML = `
        <p style="color: #999; margin-bottom: 12px; font-size: 0.9rem;">
            Intended: ${s.weight} lbs × ${s.reps}
        </p>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <span style="color: #ccc;">Reps completed:</span>
            <input type="number" class="reps-input" id="failed-reps-input"
                   value="0" min="0" max="${s.reps}" inputmode="numeric">
            <button class="btn btn-warning btn-small" id="failed-reps-confirm">Continue</button>
        </div>
    `;
    modal.classList.remove("hidden");
    setTimeout(() => {
        const input = document.getElementById("failed-reps-input");
        input.focus();
        input.select();
    }, 100);

    document.getElementById("failed-reps-confirm").addEventListener("click", () => {
        const actualReps = parseInt(document.getElementById("failed-reps-input").value) || 0;
        failSet(idx, actualReps);
    });
}

function failSet(idx, actualReps) {
    const s = workoutState.sets[idx];
    s.status = "failed";
    s.actualReps = actualReps;

    const card = document.getElementById(`set-${idx}`);
    card.classList.remove("active");
    card.classList.add("failed");
    document.getElementById(`actions-${idx}`).innerHTML = "";

    // Log the partial set
    if (actualReps > 0) {
        workoutState.cumulativeVolume += s.weight * actualReps;
        const cumulEl = document.getElementById(`cumul-${idx}`);
        if (cumulEl) cumulEl.textContent = workoutState.cumulativeVolume;

        workoutState.completedSets.push({
            lift_name: workoutState.liftName,
            weight: s.weight,
            reps: actualReps,
            notes: `failed at ${actualReps}/${s.reps}`,
        });
    }

    // Start rest timer
    if (s.rest_seconds && idx < workoutState.sets.length - 1) {
        startTimer(s.rest_seconds, () => activateSet(idx + 1));
    } else {
        activateSet(idx + 1);
    }

    // Show alternatives modal for remaining work sets
    fetch("/api/alternatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lift_name: workoutState.liftName, weight: s.weight, reps: s.reps }),
    })
        .then(r => r.json())
        .then(alts => {
            if (alts.length === 0) return;
            showFailedAlternatives(alts, idx, s.weight, s.reps, actualReps);
        });
}

function showFailedAlternatives(alternatives, failedIdx, intendedW, intendedR, actualR) {
    const modal = document.getElementById("failed-modal");
    const body = document.getElementById("failed-alternatives");
    body.innerHTML = "";

    // Context: what was intended vs what happened
    const context = document.createElement("div");
    context.style.marginBottom = "16px";
    context.style.fontSize = "0.9rem";
    context.innerHTML = `
        <p style="color: #666;">Intended: ${intendedW} lbs × ${intendedR}</p>
        <p style="color: var(--warning);">Actual: ${intendedW} lbs × ${actualR}</p>
    `;
    body.appendChild(context);

    const label = document.createElement("p");
    label.style.color = "#666";
    label.style.margin = "0 0 8px";
    label.style.fontSize = "0.8rem";
    label.textContent = "ALTERNATIVES FOR REMAINING SETS";
    body.appendChild(label);

    alternatives.forEach(alt => {
        const btn = document.createElement("button");
        btn.className = "suggestion-option";
        const totalVol = alt.weight * alt.reps;
        btn.innerHTML = `
            <div class="so-main">${alt.weight} lbs × ${alt.reps}</div>
            <div class="so-detail">Est. 1RM: ${alt.orm.toFixed(1)} lbs</div>
        `;
        btn.addEventListener("click", () => {
            // Update remaining work sets
            for (let i = failedIdx + 1; i < workoutState.sets.length; i++) {
                if (workoutState.sets[i].set_type === "work" && workoutState.sets[i].status === "pending") {
                    workoutState.sets[i].weight = alt.weight;
                    workoutState.sets[i].reps = alt.reps;
                    workoutState.sets[i].orm = alt.orm;
                    workoutState.sets[i].volume = alt.weight * alt.reps;
                    workoutState.sets[i].plates = alt.plates;
                }
            }
            renderWorkoutSets();
            // Re-mark completed/failed sets
            for (let i = 0; i <= failedIdx; i++) {
                const st = workoutState.sets[i];
                const card = document.getElementById(`set-${i}`);
                if (st.status === "completed") card.classList.add("completed");
                if (st.status === "failed") card.classList.add("failed");
            }
            modal.classList.add("hidden");
        });
        body.appendChild(btn);
    });

    modal.classList.remove("hidden");
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
                window.location.href = `/history/${encodeURIComponent(workoutState.liftName)}`;
            }
        })
        .catch(err => {
            alert("Error saving workout: " + err.message);
        });
}

// Expose for onclick in template
window.completeWorkout = completeWorkout;
window.closeSuggestionModal = closeSuggestionModal;
window.closeFailedModal = closeFailedModal;
