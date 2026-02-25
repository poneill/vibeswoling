function initPyramidWorkout() {
  const setupScreen = document.getElementById('pyr-setup-screen');
  const workoutScreen = document.getElementById('pyr-workout-screen');
  const doneScreen = document.getElementById('pyr-done-screen');
  const historyLog = document.getElementById('pyr-history-log');
  const currentReps = document.getElementById('pyr-current-reps');
  const statusText = document.getElementById('pyr-status-text');
  const timerDisplay = document.getElementById('pyr-timer-display');
  const startBtn = document.getElementById('pyr-start-btn');
  const skipBtn = document.getElementById('pyr-skip-btn');
  const doneBtn = document.getElementById('pyr-done-btn');
  const restGroup = document.getElementById('pyr-rest-group');
  const progressChart = document.getElementById('pyr-progress-chart');
  const setupSummary = document.getElementById('pyr-setup-summary');
  const maxRepsInput = document.getElementById('pyr-max-reps');
  const restPeriodInput = document.getElementById('pyr-rest-period');
  const bodyweightInput = document.getElementById('pyr-bodyweight');

  let maxReps = 5;
  let restPeriod = 90;
  let bodyweight = 195;
  let pyramid = [];
  let expectedCumulative = [];
  let currentIndex = 0;
  let timerInterval = null;
  let state = 'setup';
  let logEntries = [];
  let historyRows = [];
  let audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playChime() {
    ensureAudioContext();
    const d5 = 587.33;
    const freqs = [d5, d5 * 6/5, d5 * 3/2];
    freqs.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.12 + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.12);
      osc.stop(audioCtx.currentTime + i * 0.12 + 0.8);
    });
  }

  function buildPyramid(max) {
    const sets = [];
    for (let i = 1; i <= max; i++) sets.push(i);
    for (let i = max - 1; i >= 1; i--) sets.push(i);
    return sets;
  }

  function renderHistory() {
    historyLog.innerHTML = '';
    historyRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${row.reps}</td><td>${row.totalReps}</td><td>${row.volume.toLocaleString()}</td><td>${row.cumulative.toLocaleString()}</td>`;
      historyLog.appendChild(tr);
    });
    historyLog.scrollTop = historyLog.scrollHeight;
    renderChart();
  }

  function renderChart() {
    if (pyramid.length === 0) return;

    const canvas = progressChart;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 16, right: 16, bottom: 28, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const totalSets = pyramid.length;
    const maxVolume = expectedCumulative[expectedCumulative.length - 1];

    const xScale = (i) => pad.left + (i / (totalSets - 1)) * plotW;
    const yScale = (v) => pad.top + plotH - (v / maxVolume) * plotH;

    ctx.clearRect(0, 0, w, h);

    // Axes
    const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-border-color').trim() || '#393823';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Y-axis labels
    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-secondary-color').trim() || '#7a7260';
    ctx.fillStyle = secondaryColor;
    ctx.font = '10px SF Mono, Fira Code, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const v = (maxVolume / yTicks) * i;
      const y = yScale(v);
      ctx.fillText(Math.round(v).toLocaleString(), pad.left - 6, y);
      if (i > 0) {
        ctx.strokeStyle = borderColor;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = secondaryColor;
    const xStep = Math.max(1, Math.floor(totalSets / 6));
    for (let i = 0; i < totalSets; i += xStep) {
      ctx.fillText(i + 1, xScale(i), pad.top + plotH + 8);
    }
    if ((totalSets - 1) % xStep !== 0) {
      ctx.fillText(totalSets, xScale(totalSets - 1), pad.top + plotH + 8);
    }

    // Expected cumulative -- dashed line
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < totalSets; i++) {
      const x = xScale(i);
      const y = yScale(expectedCumulative[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Actual cumulative -- solid line
    if (historyRows.length > 0) {
      const bodyColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-body-color').trim() || '#b3a693';
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < historyRows.length; i++) {
        const x = xScale(i);
        const y = yScale(historyRows[i].cumulative);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = bodyColor;
      for (let i = 0; i < historyRows.length; i++) {
        ctx.beginPath();
        ctx.arc(xScale(i), yScale(historyRows[i].cumulative), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function showScreen(screen) {
    setupScreen.classList.add('pyr-hidden');
    workoutScreen.classList.add('pyr-hidden');
    doneScreen.classList.add('pyr-hidden');
    screen.classList.remove('pyr-hidden');
  }

  function updateWorkoutDisplay() {
    const setNum = currentIndex + 1;
    const total = pyramid.length;
    document.getElementById('pyr-current-set-label').textContent = `Set ${setNum} of ${total}`;
    currentReps.textContent = pyramid[currentIndex];
  }

  function endRest(skipped) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerDisplay.classList.remove('warning', 'imminent');
    restGroup.classList.add('pyr-invisible');
    state = 'waiting';
    doneBtn.classList.remove('pyr-invisible');
    statusText.textContent = 'Do your reps, then press Space or click Done';
    if (!skipped) playChime();
  }

  function startTimer() {
    let remaining = restPeriod;
    restGroup.classList.remove('pyr-invisible');
    state = 'resting';
    statusText.textContent = 'Rest...';

    function updateTimer() {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      timerDisplay.classList.remove('warning', 'imminent');
      if (remaining <= 3) {
        timerDisplay.classList.add('imminent');
      } else if (remaining <= 10) {
        timerDisplay.classList.add('warning');
      }

      if (remaining <= 0) {
        endRest();
      }
      remaining--;
    }

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
  }

  function logSet() {
    const reps = pyramid[currentIndex];
    const volume = reps * bodyweight;
    const prevCumulative = historyRows.length > 0 ? historyRows[historyRows.length - 1].cumulative : 0;
    const prevTotalReps = historyRows.length > 0 ? historyRows[historyRows.length - 1].totalReps : 0;
    const cumulative = prevCumulative + volume;
    const totalReps = prevTotalReps + reps;

    logEntries.push(reps);
    historyRows.push({ reps, totalReps, volume, cumulative });
    renderHistory();
  }

  function advance() {
    if (state !== 'waiting') return;

    doneBtn.classList.add('pyr-invisible');
    logSet();
    currentIndex++;

    if (currentIndex >= pyramid.length) {
      state = 'done';
      showScreen(doneScreen);
      return;
    }

    updateWorkoutDisplay();
    startTimer();
  }

  function updateSetupSummary() {
    const mr = parseInt(maxRepsInput.value, 10) || 0;
    const bw = parseFloat(bodyweightInput.value) || 0;
    const rp = parseInt(restPeriodInput.value, 10) || 0;

    const sets = buildPyramid(mr);
    const totalReps = sets.reduce((a, b) => a + b, 0);
    const totalVolume = totalReps * bw;
    const totalRestSecs = (sets.length - 1) * rp;
    const mins = Math.floor(totalRestSecs / 60);
    const secs = totalRestSecs % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    setupSummary.innerHTML = `<span>${sets.length}</span> sets &middot; <span>${totalReps}</span> reps &middot; <span>${totalVolume.toLocaleString()}</span> lbs volume &middot; <span>${timeStr}</span> rest time`;
  }

  function completeWorkout() {
    const payload = {
      sets: logEntries.map(reps => ({
        lift_name: 'pullups',
        reps: reps,
        weight: null,
        notes: ''
      }))
    };

    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) throw new Error('Failed to log workout');
      window.location.href = '/';
    })
    .catch(err => {
      alert('Error saving workout: ' + err.message);
    });
  }

  // Expose for template onclick
  window.completeWorkout = completeWorkout;

  // Setup summary live updates
  maxRepsInput.addEventListener('input', updateSetupSummary);
  restPeriodInput.addEventListener('input', updateSetupSummary);
  bodyweightInput.addEventListener('input', updateSetupSummary);
  updateSetupSummary();

  // Start button
  startBtn.addEventListener('click', () => {
    ensureAudioContext();
    maxReps = parseInt(maxRepsInput.value, 10) || 5;
    bodyweight = parseFloat(bodyweightInput.value) || 195;
    restPeriod = parseInt(restPeriodInput.value, 10) || 90;

    pyramid = buildPyramid(maxReps);
    expectedCumulative = [];
    let cum = 0;
    for (const reps of pyramid) {
      cum += reps * bodyweight;
      expectedCumulative.push(cum);
    }
    currentIndex = 0;
    logEntries = [];
    historyRows = [];
    state = 'waiting';

    showScreen(workoutScreen);
    progressChart.classList.remove('pyr-hidden');
    updateWorkoutDisplay();
    statusText.textContent = 'Do your reps, then press Space or click Done';
    doneBtn.classList.remove('pyr-invisible');
    restGroup.classList.add('pyr-invisible');
    renderHistory();
  });

  // Skip rest
  skipBtn.addEventListener('click', () => {
    if (state === 'resting') endRest(true);
  });

  // Done button
  doneBtn.addEventListener('click', () => {
    advance();
  });

  // Space bar shortcut
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state === 'waiting') {
      e.preventDefault();
      advance();
    }
  });
}
