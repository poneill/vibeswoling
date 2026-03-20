/* D3.js charts for the history page. */

// --- 1RM inverse: given target 1RM and reps, what weight? ---
function weightForOrm(targetOrm, reps) {
    if (reps <= 1) return targetOrm;
    const wEpley = targetOrm / (1 + reps / 30);
    const wBrzycki = targetOrm * (37 - reps) / 36;
    const wLombardi = targetOrm / Math.pow(reps, 0.10);
    return (wEpley + wBrzycki + wLombardi) / 3;
}

function effectiveOrm(w, r) {
    if (r <= 1) return w;
    const epley = w * (1 + r / 30);
    const brzycki = w * 36 / (37 - r);
    const lombardi = w * Math.pow(r, 0.10);
    return (epley + brzycki + lombardi) / 3;
}

// --- Temporal Chart ---
function renderTemporalChart(data, selector) {
    const container = document.querySelector(selector);
    if (!container || data.length === 0) return;

    // Group by date (session) and aggregate
    const sessions = new Map();
    data.forEach(d => {
        const dateKey = d.date.substring(0, 10);
        if (!sessions.has(dateKey)) {
            sessions.set(dateKey, { date: new Date(d.date), orms: [], totalVolume: 0 });
        }
        const s = sessions.get(dateKey);
        if (d.orm) s.orms.push(d.orm);
        if (d.volume) s.totalVolume += d.volume;
    });

    const sessionData = Array.from(sessions.values())
        .filter(s => s.orms.length > 0)
        .map(s => ({
            date: s.date,
            maxOrm: Math.max(...s.orms),
            volume: s.totalVolume,
        }))
        .sort((a, b) => a.date - b.date);

    if (sessionData.length === 0) return;

    const width = container.clientWidth;
    const height = 300;
    const margin = { top: 20, right: 55, bottom: 35, left: 55 };

    const svg = d3.select(selector).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const x = d3.scaleTime()
        .domain(d3.extent(sessionData, d => d.date))
        .range([margin.left, width - margin.right]);

    const yOrm = d3.scaleLinear()
        .domain([0, d3.max(sessionData, d => d.maxOrm) * 1.1])
        .range([height - margin.bottom, margin.top]);

    const yVol = d3.scaleLinear()
        .domain([0, d3.max(sessionData, d => d.volume) * 1.1])
        .range([height - margin.bottom, margin.top]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b '%y")))
        .attr("color", "#999");

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yOrm).ticks(5))
        .attr("color", "#1a6b7a");

    svg.append("g")
        .attr("transform", `translate(${width - margin.right},0)`)
        .call(d3.axisRight(yVol).ticks(5))
        .attr("color", "#c76b00");

    // Axis labels
    svg.append("text").attr("x", margin.left).attr("y", margin.top - 6)
        .attr("fill", "#1a6b7a").attr("font-size", "11px").text("1RM (lbs)");
    svg.append("text").attr("x", width - margin.right).attr("y", margin.top - 6)
        .attr("fill", "#c76b00").attr("font-size", "11px").attr("text-anchor", "end").text("Volume");

    // ORM line
    const ormLine = d3.line()
        .x(d => x(d.date))
        .y(d => yOrm(d.maxOrm));

    svg.append("path")
        .datum(sessionData)
        .attr("fill", "none")
        .attr("stroke", "#1a6b7a")
        .attr("stroke-width", 2)
        .attr("d", ormLine);

    svg.selectAll(".orm-dot")
        .data(sessionData).join("circle")
        .attr("cx", d => x(d.date))
        .attr("cy", d => yOrm(d.maxOrm))
        .attr("r", 4)
        .attr("fill", "#1a6b7a");

    // Volume bars
    const barWidth = Math.max(4, (width - margin.left - margin.right) / sessionData.length * 0.4);
    svg.selectAll(".vol-bar")
        .data(sessionData).join("rect")
        .attr("x", d => x(d.date) - barWidth / 2)
        .attr("y", d => yVol(d.volume))
        .attr("width", barWidth)
        .attr("height", d => height - margin.bottom - yVol(d.volume))
        .attr("fill", "#c76b00")
        .attr("opacity", 0.4);
}

// --- Isocline Chart ---
function renderIsoclineChart(data, selector) {
    const container = document.querySelector(selector);
    if (!container || data.length === 0) return;

    const points = data
        .filter(d => d.weight && d.reps && d.reps <= 20)
        .map(d => ({
            weight: d.weight,
            reps: d.reps,
            orm: d.orm,
            date: new Date(d.date),
        }));

    if (points.length === 0) return;

    const width = container.clientWidth;
    const height = 350;
    const margin = { top: 20, right: 60, bottom: 35, left: 55 };

    const svg = d3.select(selector).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const maxWeight = d3.max(points, d => d.weight);
    const maxOrm = d3.max(points, d => d.orm);

    const x = d3.scaleLinear().domain([1, 20]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
        .domain([0, maxWeight * 1.3])
        .range([height - margin.bottom, margin.top]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(10).tickFormat(d => d))
        .attr("color", "#999");

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(8))
        .attr("color", "#999");

    svg.append("text").attr("x", width / 2).attr("y", height - 2)
        .attr("fill", "#999").attr("font-size", "11px").attr("text-anchor", "middle").text("Reps");
    svg.append("text").attr("x", margin.left).attr("y", margin.top - 6)
        .attr("fill", "#999").attr("font-size", "11px").text("Weight (lbs)");

    // Isocline curves
    const ormStep = 25;
    const minOrm = Math.floor(d3.min(points, d => d.orm) / ormStep) * ormStep;
    const ormMax = Math.ceil(maxOrm / ormStep) * ormStep + ormStep;

    const line = d3.line()
        .x(d => x(d.reps))
        .y(d => y(d.weight));

    for (let orm = minOrm; orm <= ormMax; orm += ormStep) {
        const curveData = [];
        for (let r = 1; r <= 20; r++) {
            const w = weightForOrm(orm, r);
            if (w > 0 && w <= maxWeight * 1.4) {
                curveData.push({ reps: r, weight: w });
            }
        }
        if (curveData.length < 2) continue;

        svg.append("path")
            .datum(curveData)
            .attr("fill", "none")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "4,4")
            .attr("d", line);

        // Label at the right edge
        const last = curveData[curveData.length - 1];
        svg.append("text")
            .attr("x", x(last.reps) + 4)
            .attr("y", y(last.weight) + 3)
            .attr("fill", "#999")
            .attr("font-size", "9px")
            .text(orm);
    }

    // Color scale by date: gray (old) -> green (recent)
    const dateExtent = d3.extent(points, d => d.date);
    const colorScale = d3.scaleTime()
        .domain(dateExtent)
        .range(["#ccc", "#1a7a42"]);

    // Data points
    svg.selectAll(".iso-point")
        .data(points).join("circle")
        .attr("cx", d => x(d.reps))
        .attr("cy", d => y(d.weight))
        .attr("r", 4)
        .attr("fill", d => colorScale(d.date))
        .attr("stroke", "#faf8f5")
        .attr("stroke-width", 1);

    // Date labels on the 3 most recent sessions
    const sessionDates = [...new Set(points.map(d => d.date.toISOString().slice(0, 10)))].sort().reverse();
    const recentDates = new Set(sessionDates.slice(0, 3));
    const recentPoints = points.filter(d => recentDates.has(d.date.toISOString().slice(0, 10)));

    // Pick one point per session (the highest weight) to label
    const labelMap = new Map();
    recentPoints.forEach(d => {
        const key = d.date.toISOString().slice(0, 10);
        if (!labelMap.has(key) || d.weight > labelMap.get(key).weight) {
            labelMap.set(key, d);
        }
    });

    svg.selectAll(".date-label")
        .data(Array.from(labelMap.values())).join("text")
        .attr("x", d => x(d.reps) + 7)
        .attr("y", d => y(d.weight) + 3)
        .attr("fill", "#1a7a42")
        .attr("font-size", "9px")
        .attr("text-anchor", "start")
        .text(d => d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
}

// --- Calculator Chart ---
function renderCalculatorChart(data, selector) {
    const container = document.querySelector(selector);
    if (!container) return;

    const inputW = data.input.weight;
    const inputR = data.input.reps;
    const currentOrm = data.current_orm;
    const targetOrm = data.target_orm;

    const width = container.clientWidth;
    const height = 350;
    const margin = { top: 20, right: 60, bottom: 35, left: 55 };

    const svg = d3.select(selector).append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // Axis ranges based on input — show enough context
    const minWeight = Math.max(0, inputW - 60);
    const maxWeight = inputW + 30;

    const x = d3.scaleLinear().domain([1, 20]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([minWeight, maxWeight]).range([height - margin.bottom, margin.top]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(10).tickFormat(d => d))
        .attr("color", "#999");
    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(8))
        .attr("color", "#999");
    svg.append("text").attr("x", width / 2).attr("y", height - 2)
        .attr("fill", "#999").attr("font-size", "11px").attr("text-anchor", "middle").text("Reps");
    svg.append("text").attr("x", margin.left).attr("y", margin.top - 6)
        .attr("fill", "#999").attr("font-size", "11px").text("Weight (lbs)");

    // Isocline curves
    const ormStep = 25;
    const ormMin = Math.floor((currentOrm - 75) / ormStep) * ormStep;
    const ormMax = Math.ceil((targetOrm + 50) / ormStep) * ormStep;
    const curveLine = d3.line().x(d => x(d.reps)).y(d => y(d.weight));

    for (let orm = ormMin; orm <= ormMax; orm += ormStep) {
        const curveData = [];
        for (let r = 1; r <= 20; r++) {
            const w = weightForOrm(orm, r);
            if (w >= minWeight && w <= maxWeight) {
                curveData.push({ reps: r, weight: w });
            }
        }
        if (curveData.length < 2) continue;

        svg.append("path")
            .datum(curveData)
            .attr("fill", "none")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "4,4")
            .attr("d", curveLine);

        const last = curveData[curveData.length - 1];
        svg.append("text")
            .attr("x", x(last.reps) + 4)
            .attr("y", y(last.weight) + 3)
            .attr("fill", "#999")
            .attr("font-size", "9px")
            .text(orm);
    }

    // Shaded band between current and target ORM
    const bandUpper = []; // target ORM curve (higher weights)
    const bandLower = []; // current ORM curve (lower weights)
    for (let r = 1; r <= 20; r++) {
        const wUpper = weightForOrm(targetOrm, r);
        const wLower = weightForOrm(currentOrm, r);
        if (wUpper >= minWeight && wLower <= maxWeight) {
            bandUpper.push({ reps: r, weight: Math.min(wUpper, maxWeight) });
            bandLower.push({ reps: r, weight: Math.max(wLower, minWeight) });
        }
    }
    if (bandUpper.length > 1) {
        const bandPath = [...bandUpper, ...bandLower.reverse()];
        const area = d3.line().x(d => x(d.reps)).y(d => y(d.weight));
        svg.append("path")
            .datum(bandPath)
            .attr("fill", "#1a7a42")
            .attr("opacity", 0.12)
            .attr("d", area);
    }

    // Alternative points
    data.alternatives.forEach(alt => {
        svg.append("circle")
            .attr("cx", x(alt.reps))
            .attr("cy", y(alt.weight))
            .attr("r", 3.5)
            .attr("fill", "#1a7a42")
            .attr("opacity", 0.6);
    });

    // Default point (W+5, same reps)
    svg.append("circle")
        .attr("cx", x(data.default.reps))
        .attr("cy", y(data.default.weight))
        .attr("r", 5)
        .attr("fill", "#1a7a42")
        .attr("stroke", "#faf8f5")
        .attr("stroke-width", 1.5);

    // Input point
    svg.append("circle")
        .attr("cx", x(inputR))
        .attr("cy", y(inputW))
        .attr("r", 6)
        .attr("fill", "#c0392b")
        .attr("stroke", "#faf8f5")
        .attr("stroke-width", 1.5);

    // Hover interaction
    const tooltip = document.getElementById("calc-tooltip");
    const crosshairV = svg.append("line").attr("stroke", "#999").attr("stroke-width", 0.5).attr("stroke-dasharray", "2,2").style("display", "none");
    const crosshairH = svg.append("line").attr("stroke", "#999").attr("stroke-width", 0.5).attr("stroke-dasharray", "2,2").style("display", "none");

    svg.append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "transparent")
        .on("mousemove", function(event) {
            const [mx, my] = d3.pointer(event);
            const rawReps = Math.round(x.invert(mx));
            const rawWeight = Math.round(y.invert(my) / 5) * 5;
            const reps = Math.max(1, Math.min(20, rawReps));
            const weight = Math.max(minWeight, Math.min(maxWeight, rawWeight));
            const orm = effectiveOrm(weight, reps);

            tooltip.classList.remove("hidden");
            tooltip.textContent = `${weight} lbs × ${reps} → 1RM: ${orm.toFixed(1)}`;

            // Position tooltip relative to chart container
            const rect = container.getBoundingClientRect();
            const svgRect = container.querySelector("svg").getBoundingClientRect();
            tooltip.style.left = (event.clientX - rect.left + 12) + "px";
            tooltip.style.top = (event.clientY - rect.top - 10) + "px";

            // Crosshairs
            const cx = x(reps), cy = y(weight);
            crosshairV.attr("x1", cx).attr("y1", margin.top).attr("x2", cx).attr("y2", height - margin.bottom).style("display", null);
            crosshairH.attr("x1", margin.left).attr("y1", cy).attr("x2", width - margin.right).attr("y2", cy).style("display", null);
        })
        .on("mouseleave", function() {
            tooltip.classList.add("hidden");
            crosshairV.style("display", "none");
            crosshairH.style("display", "none");
        });
}
