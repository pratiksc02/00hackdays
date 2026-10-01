 let state = {
  mode: 'hardware',         // 'hardware' or 'vision'
  pitch: 5.0,               // Current pitch angle in degrees
  baseline: 0.0,            // Calibrated zero baseline
  threshold: 15.0,          // Slouch threshold sensitivity
  isAudioEnabled: true,     // Web Audio haptic alert toggle
  slouchSeconds: 0,         // Continuous slouch timer
  score: 98,                // Ergonomic health score (0 - 100)
  history: Array(20).fill(5), // 20-second historical pitch readings
  isSimulating: false,      // Auto slouch simulation flag
  simInterval: null,
  timerInterval: null
};

// CANVAS & AUDIO CONTEXT REFERENCE
let canvas, ctx;
let audioCtx = null;

// INITIALIZE APPLICATION
window.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Setup HTML5 Canvas
  canvas = document.getElementById('spineCanvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
    resizeCanvas();
  }
  
  window.addEventListener('resize', resizeCanvas);

  // Start Session Timers & Loops
  startTelemetryTimer();
  requestAnimationFrame(renderLoop);
});

// Extra resize trigger on page load to prevent blank 0x0 canvas
window.addEventListener('load', () => {
  resizeCanvas();
  renderChart();
});

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1);
  canvas.height = rect.height * (window.devicePixelRatio || 1);
}

// UPDATE FUNCTIONS
function updatePitch(val) {
  state.pitch = parseFloat(val);
  const pitchDisplay = document.getElementById('pitch-display');
  const sliderPitchVal = document.getElementById('slider-pitch-val');
  
  if (pitchDisplay) pitchDisplay.innerText = `${state.pitch.toFixed(1)}°`;
  if (sliderPitchVal) sliderPitchVal.innerText = `${state.pitch.toFixed(1)}°`;
}

function updateThreshold(val) {
  state.threshold = parseFloat(val);
  const cardVal = document.getElementById('threshold-display-card');
  const sliderVal = document.getElementById('slider-threshold-val');
  
  if (cardVal) cardVal.innerText = `${state.threshold.toFixed(1)}°`;
  if (sliderVal) sliderVal.innerText = `${state.threshold.toFixed(1)}°`;
}

function recalibrate() {
  state.baseline = state.pitch;
  triggerHapticPulse(800, 100);
  alert(`Calibrated Baseline set to ${state.baseline.toFixed(1)}°. Subtracted from pitch readings.`);
}

// AUDIO HAPTIC FEEDBACK (WEB AUDIO API)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function toggleAudio() {
  state.isAudioEnabled = !state.isAudioEnabled;
  const btn = document.getElementById('audio-toggle-btn');
  if (btn) {
    if (state.isAudioEnabled) {
      btn.classList.remove('opacity-50');
      btn.innerHTML = `<i data-lucide="volume-2" class="w-3 h-3"></i> Haptic Audio Alert`;
    } else {
      btn.classList.add('opacity-50');
      btn.innerHTML = `<i data-lucide="volume-x" class="w-3 h-3"></i> Muted`;
    }
  }
  if (window.lucide) lucide.createIcons();
}

function triggerHapticPulse(freq = 440, duration = 150) {
  if (!state.isAudioEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (duration / 1000));
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + (duration / 1000));
  } catch(e) {
    console.log("Audio feedback error:", e);
  }
}

function triggerHapticTest() {
  triggerHapticPulse(520, 200);
}

// MODE SWITCHING (HARDWARE vs WEBCAM VISION)
function setMode(mode) {
  state.mode = mode;
  const hwBtn = document.getElementById('mode-hardware-btn');
  const visBtn = document.getElementById('mode-vision-btn');
  const visionContainer = document.getElementById('vision-container');

  if (mode === 'hardware') {
    if (hwBtn) hwBtn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white transition-all shadow-sm";
    if (visBtn) visBtn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all";
    if (visionContainer) visionContainer.classList.add('hidden');
    
    const connText = document.getElementById('connection-text');
    if (connText) connText.innerText = "ESP32 BLE: Connected";
  } else {
    if (visBtn) visBtn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white transition-all shadow-sm";
    if (hwBtn) hwBtn.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all";
    if (visionContainer) visionContainer.classList.remove('hidden');
    
    const connText = document.getElementById('connection-text');
    if (connText) connText.innerText = "Camera Vision: Active";
    startWebcam();
  }
}

function startWebcam() {
  const video = document.getElementById('webcam');
  if (video && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
      })
      .catch(err => {
        console.warn("Webcam access declined or unavailable:", err);
      });
  }
}

// AUTO-SIMULATE SLOUCH CYCLE
function toggleSlouchSimulation() {
  const btn = document.getElementById('sim-slouch-btn');
  if (state.isSimulating) {
    clearInterval(state.simInterval);
    state.isSimulating = false;
    if (btn) {
      btn.classList.remove('bg-rose-500', 'text-white');
      btn.classList.add('bg-rose-500/10', 'text-rose-400');
      btn.innerHTML = `<i data-lucide="play-circle" class="w-4 h-4"></i> Auto-Simulate Slouch`;
    }
    updatePitch(5);
  } else {
    state.isSimulating = true;
    if (btn) {
      btn.classList.remove('bg-rose-500/10', 'text-rose-400');
      btn.classList.add('bg-rose-500', 'text-white');
      btn.innerHTML = `<i data-lucide="stop-circle" class="w-4 h-4"></i> Stop Simulation`;
    }
    
    let step = 0;
    state.simInterval = setInterval(() => {
      step++;
      const targetPitch = 5 + Math.sin(step * 0.2) * 25;
      updatePitch(Math.max(-5, targetPitch));
      const slider = document.getElementById('pitchSlider');
      if (slider) slider.value = state.pitch;
    }, 200);
  }
  if (window.lucide) lucide.createIcons();
}

// TELEMETRY HISTORY & SCORE TIMER
function startTelemetryTimer() {
  setInterval(() => {
    state.history.shift();
    state.history.push(state.pitch);
    renderChart();

    const isSlouching = (state.pitch - state.baseline) > state.threshold;

    if (isSlouching) {
      state.slouchSeconds++;
      state.score = Math.max(20, state.score - 1);
      triggerHapticPulse(300, 100);
    } else {
      state.score = Math.min(100, state.score + 0.5);
    }

    const scoreText = document.getElementById('score-text');
    const scoreBar = document.getElementById('score-bar');
    if (scoreText) scoreText.innerText = `${Math.round(state.score)}%`;
    if (scoreBar) scoreBar.style.width = `${Math.round(state.score)}%`;
    
    const mins = Math.floor(state.slouchSeconds / 60).toString().padStart(2, '0');
    const secs = (state.slouchSeconds % 60).toString().padStart(2, '0');
    const timerElem = document.getElementById('slouch-timer');
    if (timerElem) timerElem.innerText = `${mins}:${secs}`;

    const badge = document.getElementById('status-badge');
    const statusText = document.getElementById('slouch-status-text');

    if (isSlouching) {
      if (badge) {
        badge.className = "absolute top-4 right-4 px-3.5 py-1.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-2 shadow-lg status-alert";
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span> SLOUCH DETECTED`;
      }
      if (statusText) {
        statusText.innerText = "Spine threshold exceeded!";
        statusText.className = "text-[10px] text-rose-400 font-bold mt-3 font-mono";
      }
    } else {
      if (badge) {
        badge.className = "absolute top-4 right-4 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-2 shadow-lg";
        badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> OPTIMAL POSTURE`;
      }
      if (statusText) {
        statusText.innerText = "Good spinal alignment";
        statusText.className = "text-[10px] text-slate-500 mt-3 font-mono";
      }
    }
  }, 1000);
}

// RENDER HISTORICAL TELEMETRY BAR CHART
function renderChart() {
  const container = document.getElementById('chart-bars-container');
  if (!container) return;
  container.innerHTML = '';

  state.history.forEach((val) => {
    const bar = document.createElement('div');
    const heightPercent = Math.min(100, Math.max(10, (val / 40) * 100));
    const isOver = val > state.threshold;

    bar.className = `flex-1 rounded-t transition-all duration-300 ${isOver ? 'bg-rose-500 shadow-lg shadow-rose-500/20' : 'bg-indigo-500/60 hover:bg-indigo-400'}`;
    bar.style.height = `${heightPercent}%`;
    container.appendChild(bar);
  });
}

// 2D CANVAS SPINE KINEMATICS ANIMATION LOOP
function renderLoop() {
  if (ctx && canvas) {
    drawSpine();
  }
  requestAnimationFrame(renderLoop);
}

function drawSpine() {
  if (!canvas || !ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  if (w === 0 || h === 0) return;

  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2;
  const startY = h * 0.82;
  const spineLength = h * 0.52;

  const currentPitch = state.pitch - state.baseline;
  const isSlouching = currentPitch > state.threshold;

  // Draw Grid
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 35) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Calculate Curve Points
  const numVertebrae = 10;
  const points = [];
  const bendAmount = (currentPitch / 45) * 110;

  for (let i = 0; i <= numVertebrae; i++) {
    const t = i / numVertebrae;
    const y = startY - (t * spineLength);
    const x = centerX + Math.pow(t, 1.8) * bendAmount;
    points.push({ x, y });
  }

  // Baseline Reference Axis
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 2;
  ctx.moveTo(centerX, startY);
  ctx.lineTo(centerX, startY - spineLength);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw Spine Line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i-1].x) / 2;
    const yc = (points[i].y + points[i-1].y) / 2;
    ctx.quadraticCurveTo(points[i-1].x, points[i-1].y, xc, yc);
  }
  ctx.strokeStyle = isSlouching ? '#f43f5e' : '#6366f1';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Draw Vertebrae Nodes
  points.forEach((pt, idx) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, idx === points.length - 1 ? 9 : 5, 0, Math.PI * 2);
    ctx.fillStyle = idx === points.length - 1 
      ? (isSlouching ? '#f43f5e' : '#818cf8')
      : '#020617';
    ctx.fill();
    ctx.strokeStyle = isSlouching ? '#fb7185' : '#818cf8';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Draw Head Ring
  const headPt = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(headPt.x + (bendAmount * 0.12), headPt.y - 24, 18, 0, Math.PI * 2);
  ctx.fillStyle = isSlouching ? 'rgba(244, 63, 94, 0.15)' : 'rgba(99, 102, 241, 0.15)';
  ctx.fill();
  ctx.strokeStyle = isSlouching ? '#f43f5e' : '#818cf8';
  ctx.lineWidth = 2;
  ctx.stroke();
}