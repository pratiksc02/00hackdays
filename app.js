 /**
 * PosturePulse Core Logic
 * - Visual Human Spine Column Renderer
 * - Real-time Slouch & Tilt Analytics
 * - Web Audio & Haptic Feedback API
 * - Native OS Desktop Notifications & Break Reminders
 * - CSV Data Exporting
 */

// Application State
const state = {
  isRunning: false,
  isDemoMode: false,
  isMuted: false,
  baseline: {
    eyeShoulderDist: null,
    shoulderAngle: 0,
  },
  thresholds: {
    slouchSensPercent: 15,
    tiltAngleDeg: 8,
    alertDelaySec: 2.0,
  },
  metrics: {
    slouchCount: 0,
    goodTicks: 0,
    totalTicks: 0,
    sessionStartTime: null,
  },
  slouchStartTime: null,
  isAlertActive: false,
  continuousSittingTime: 0, // In seconds for stretch reminders
};

// Sensitivity Preset Configurations
const PRESETS = {
  strict: { slouchPercent: 8, tiltAngle: 5, delaySec: 1.0 },
  normal: { slouchPercent: 15, tiltAngle: 8, delaySec: 2.0 },
  relaxed: { slouchPercent: 25, tiltAngle: 12, delaySec: 3.5 },
};

// DOM Reference Selectors
const elements = {
  webcam: document.getElementById('webcam'),
  canvas: document.getElementById('outputCanvas'),
  ctx: document.getElementById('outputCanvas').getContext('2d'),
  startCamBtn: document.getElementById('startCamBtn'),
  calibrateBtn: document.getElementById('calibrateBtn'),
  toggleAudioBtn: document.getElementById('toggleAudioBtn'),
  audioIcon: document.getElementById('audioIcon'),
  demoModeToggle: document.getElementById('demoModeToggle'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  hudSlouchVal: document.getElementById('hudSlouchVal'),
  hudTiltVal: document.getElementById('hudTiltVal'),
  alertBanner: document.getElementById('alertBanner'),
  alertMessage: document.getElementById('alertMessage'),
  scoreText: document.getElementById('scoreText'),
  slouchCountText: document.getElementById('slouchCountText'),
  durationText: document.getElementById('durationText'),
  eventLog: document.getElementById('eventLog'),
  // Controls
  slouchSensInput: document.getElementById('slouchSens'),
  slouchSensVal: document.getElementById('slouchSensVal'),
  tiltSensInput: document.getElementById('tiltSens'),
  tiltSensVal: document.getElementById('tiltSensVal'),
  alertDelayInput: document.getElementById('alertDelay'),
  alertDelayVal: document.getElementById('alertDelayVal'),
};

let audioCtx = null;
let poseDetector = null;
let cameraInstance = null;
let timerInterval = null;
let stretchInterval = null;
let demoAnimationFrame = null;

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initMediaPipe();
  resizeCanvas();
  requestNotificationPermission();

  if (elements.demoModeToggle && elements.demoModeToggle.checked) {
    toggleDemoMode();
  }
});

function setupEventListeners() {
  if (elements.startCamBtn) elements.startCamBtn.addEventListener('click', toggleCamera);
  if (elements.calibrateBtn) elements.calibrateBtn.addEventListener('click', handleCalibration);
  if (elements.toggleAudioBtn) elements.toggleAudioBtn.addEventListener('click', toggleAudio);
  if (elements.demoModeToggle) elements.demoModeToggle.addEventListener('change', toggleDemoMode);
  if (elements.themeToggleBtn) elements.themeToggleBtn.addEventListener('click', toggleTheme);

  if (elements.slouchSensInput) {
    elements.slouchSensInput.addEventListener('input', (e) => {
      state.thresholds.slouchSensPercent = parseFloat(e.target.value);
      if (elements.slouchSensVal) elements.slouchSensVal.textContent = `${state.thresholds.slouchSensPercent}%`;
    });
  }

  if (elements.tiltSensInput) {
    elements.tiltSensInput.addEventListener('input', (e) => {
      state.thresholds.tiltAngleDeg = parseFloat(e.target.value);
      if (elements.tiltSensVal) elements.tiltSensVal.textContent = `${state.thresholds.tiltAngleDeg}°`;
    });
  }

  if (elements.alertDelayInput) {
    elements.alertDelayInput.addEventListener('input', (e) => {
      state.thresholds.alertDelaySec = parseFloat(e.target.value);
      if (elements.alertDelayVal) elements.alertDelayVal.textContent = `${state.thresholds.alertDelaySec.toFixed(1)}s`;
    });
  }

  window.addEventListener('resize', resizeCanvas);
}

// Feature: Request Native OS Notification Permissions
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function resizeCanvas() {
  const container = elements.canvas ? elements.canvas.parentElement : null;
  if (container) {
    elements.canvas.width = container.clientWidth;
    elements.canvas.height = container.clientHeight;
  }
}

function initMediaPipe() {
  if (typeof Pose === 'undefined') return;

  poseDetector = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });

  poseDetector.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  poseDetector.onResults(onPoseResults);
}

async function toggleCamera() {
  if (state.isRunning && !state.isDemoMode) {
    stopCamera();
    return;
  }

  if (state.isDemoMode) {
    if (elements.demoModeToggle) elements.demoModeToggle.checked = false;
    toggleDemoMode();
  }

  try {
    elements.startCamBtn.disabled = true;
    elements.startCamBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Initializing...`;

    cameraInstance = new Camera(elements.webcam, {
      onFrame: async () => {
        if (state.isRunning && poseDetector) {
          await poseDetector.send({ image: elements.webcam });
        }
      },
      width: 640,
      height: 480,
    });

    await cameraInstance.start();
    state.isRunning = true;
    startSessionTimer();

    elements.startCamBtn.disabled = false;
    elements.startCamBtn.innerHTML = `<i class="fa-solid fa-stop"></i> Stop Camera`;
    if (elements.calibrateBtn) elements.calibrateBtn.disabled = false;
    updateStatus('good', 'Tracking Active');
    addLog('Camera feed started successfully.', 'success');

  } catch (err) {
    console.error('Camera Error:', err);
    addLog('Camera access denied or unreadable. Switching to Demo Mode.', 'danger');
    elements.startCamBtn.disabled = false;
    elements.startCamBtn.innerHTML = `<i class="fa-solid fa-play"></i> Start Camera`;
    if (elements.demoModeToggle) elements.demoModeToggle.checked = true;
    toggleDemoMode();
  }
}

function stopCamera() {
  state.isRunning = false;
  if (cameraInstance) {
    cameraInstance.stop();
  }
  stopSessionTimer();
  if (elements.startCamBtn) elements.startCamBtn.innerHTML = `<i class="fa-solid fa-play"></i> Start Camera`;
  if (elements.calibrateBtn) elements.calibrateBtn.disabled = true;
  updateStatus('neutral', 'System Ready');
  addLog('Camera feed stopped.', 'info');
}

function onPoseResults(results) {
  if (!state.isRunning) return;

  const ctx = elements.ctx;
  ctx.save();
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  ctx.drawImage(results.image, 0, 0, elements.canvas.width, elements.canvas.height);

  if (results.poseLandmarks) {
    processLandmarks(results.poseLandmarks);
  } else {
    updateStatus('warn', 'Searching for Body...');
  }

  ctx.restore();
}

function processLandmarks(landmarks) {
  const leftEye = landmarks[2];
  const rightEye = landmarks[5];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!leftEye || !rightEye || !leftShoulder || !rightShoulder) return;

  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const currentEyeShoulderDist = Math.abs(shoulderMidY - eyeMidY);

  const dX = (rightShoulder.x - leftShoulder.x) * elements.canvas.width;
  const dY = (rightShoulder.y - leftShoulder.y) * elements.canvas.height;
  const currentTiltAngle = Math.abs(Math.atan2(dY, dX) * (180 / Math.PI));

  if (!state.baseline.eyeShoulderDist) {
    state.baseline.eyeShoulderDist = currentEyeShoulderDist;
    state.baseline.shoulderAngle = currentTiltAngle;
    addLog('Auto-calibrated upright posture baseline.', 'info');
  }

  const slouchRatio = ((state.baseline.eyeShoulderDist - currentEyeShoulderDist) / state.baseline.eyeShoulderDist) * 100;
  const tiltDeviation = Math.abs(currentTiltAngle - state.baseline.shoulderAngle);

  if (elements.hudSlouchVal) elements.hudSlouchVal.textContent = `${Math.max(0, slouchRatio.toFixed(0))}%`;
  if (elements.hudTiltVal) elements.hudTiltVal.textContent = `${tiltDeviation.toFixed(1)}°`;

  const isSlouching = slouchRatio > state.thresholds.slouchSensPercent;
  const isTilting = tiltDeviation > state.thresholds.tiltAngleDeg;
  const isBad = isSlouching || isTilting;

  handlePostureStatus(isBad, isSlouching ? 'Forward Slouch' : 'Shoulder Tilt');

  drawSpineOverlay(landmarks, isBad, slouchRatio);
}

function handlePostureStatus(hasBadPosture, reason) {
  state.metrics.totalTicks++;

  if (hasBadPosture) {
    if (!state.slouchStartTime) {
      state.slouchStartTime = Date.now();
    }

    const duration = (Date.now() - state.slouchStartTime) / 1000;

    if (duration >= state.thresholds.alertDelaySec) {
      if (!state.isAlertActive) {
        state.isAlertActive = true;
        state.metrics.slouchCount++;
        if (elements.slouchCountText) elements.slouchCountText.textContent = state.metrics.slouchCount;
        
        // Trigger Multi-Channel Alerts
        triggerAudioAlert();
        triggerVibrationAlert();
        triggerDesktopNotification(reason);

        addLog(`Posture Alert: Bad posture detected (${reason}).`, 'danger');
      }
      if (elements.alertBanner) elements.alertBanner.classList.remove('hidden');
      if (elements.alertMessage) elements.alertMessage.textContent = `Posture Alert! Fix ${reason}`;
      updateStatus('bad', 'Bad Posture Detected');
    } else {
      updateStatus('warn', 'Checking Posture...');
    }
  } else {
    state.slouchStartTime = null;
    state.isAlertActive = false;
    state.metrics.goodTicks++;
    if (elements.alertBanner) elements.alertBanner.classList.add('hidden');
    updateStatus('good', 'Posture Upright');
  }

  const score = Math.round((state.metrics.goodTicks / state.metrics.totalTicks) * 100) || 100;
  if (elements.scoreText) elements.scoreText.textContent = `${score}%`;
}

// Feature: Desktop OS Notification Trigger
function triggerDesktopNotification(reason) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Posture Warning! ⚠️️', {
      body: `You are currently slouching (${reason}). Sit up straight!`,
      icon: 'https://cdn-icons-png.flaticon.com/512/2823/2823860.png',
    });
  }
}

// Feature: Mobile Device Vibration Trigger
function triggerVibrationAlert() {
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

/**
 * Custom Spine & Vertebrae Renderer
 */
function drawSpineOverlay(landmarks, isBad, slouchRatio) {
  const ctx = elements.ctx;
  const width = elements.canvas.width;
  const height = elements.canvas.height;

  const color = isBad ? '#ef4444' : '#10b981';
  const glowColor = isBad ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)';

  const nose = landmarks[0] || { x: 0.5, y: 0.25 };
  const leftShoulder = landmarks[11] || { x: 0.38, y: 0.45 };
  const rightShoulder = landmarks[12] || { x: 0.62, y: 0.45 };

  const cervicalTop = { x: nose.x * width, y: (nose.y + 0.05) * height };
  const thoracicMid = { 
    x: ((leftShoulder.x + rightShoulder.x) / 2) * width, 
    y: ((leftShoulder.y + rightShoulder.y) / 2) * height 
  };

  const curvatureOffset = Math.max(0, slouchRatio) * 1.5;
  const lumbarMid = {
    x: thoracicMid.x + (curvatureOffset > 0 ? curvatureOffset : 0),
    y: thoracicMid.y + height * 0.2
  };
  const sacrumBase = {
    x: thoracicMid.x,
    y: lumbarMid.y + height * 0.15
  };

  ctx.beginPath();
  ctx.moveTo(leftShoulder.x * width, leftShoulder.y * height);
  ctx.lineTo(rightShoulder.x * width, rightShoulder.y * height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cervicalTop.x, cervicalTop.y);
  ctx.quadraticCurveTo(thoracicMid.x + curvatureOffset, thoracicMid.y, lumbarMid.x, lumbarMid.y);
  ctx.quadraticCurveTo(lumbarMid.x - (curvatureOffset * 0.5), sacrumBase.y, sacrumBase.x, sacrumBase.y);

  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const totalVertebrae = 8;
  for (let i = 0; i <= totalVertebrae; i++) {
    const t = i / totalVertebrae;
    const vx = Math.pow(1 - t, 2) * cervicalTop.x + 2 * (1 - t) * t * (thoracicMid.x + curvatureOffset) + Math.pow(t, 2) * lumbarMid.x;
    const vy = Math.pow(1 - t, 2) * cervicalTop.y + 2 * (1 - t) * t * thoracicMid.y + Math.pow(t, 2) * lumbarMid.y;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(vx, vy, 7, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = color;
  ctx.font = '10px sans-serif';
  ctx.fillText('C1 Cervical', cervicalTop.x + 12, cervicalTop.y + 4);
  ctx.fillText('L5 Lumbar', sacrumBase.x + 12, sacrumBase.y + 4);
}

function handleCalibration() {
  state.baseline.eyeShoulderDist = null;
  addLog('Baseline reset. Sit up straight for recalibration...', 'warning');
}

function triggerAudioAlert() {
  if (state.isMuted) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.warn('Audio Error:', e);
  }
}

function toggleAudio() {
  state.isMuted = !state.isMuted;
  if (state.isMuted) {
    if (elements.audioIcon) elements.audioIcon.className = 'fa-solid fa-volume-xmark';
    addLog('Audio alerts muted.', 'info');
  } else {
    if (elements.audioIcon) elements.audioIcon.className = 'fa-solid fa-volume-high';
    addLog('Audio alerts unmuted.', 'info');
  }
}

function toggleDemoMode() {
  state.isDemoMode = elements.demoModeToggle ? elements.demoModeToggle.checked : false;

  if (state.isDemoMode) {
    if (state.isRunning) stopCamera();
    state.isRunning = true;
    startSessionTimer();
    if (elements.calibrateBtn) elements.calibrateBtn.disabled = false;
    addLog('Simulated Demo Mode active.', 'info');
    runDemoLoop();
  } else {
    state.isRunning = false;
    if (demoAnimationFrame) {
      cancelAnimationFrame(demoAnimationFrame);
    }
    stopSessionTimer();
    elements.ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    updateStatus('neutral', 'System Ready');
    addLog('Exited Demo Mode.', 'info');
  }
}

function runDemoLoop() {
  if (!state.isDemoMode) return;

  resizeCanvas();

  const ctx = elements.ctx;
  const time = Date.now() * 0.0025;

  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);

  const slouchCycle = Math.sin(time);
  const slouchOffset = slouchCycle > 0.1 ? slouchCycle * 0.12 : 0;

  const mockLandmarks = {
    0: { x: 0.5, y: 0.22 + (slouchOffset * 0.5) },
    2: { x: 0.45, y: 0.25 + (slouchOffset * 0.5) },
    5: { x: 0.55, y: 0.25 + (slouchOffset * 0.5) },
    11: { x: 0.38, y: 0.45, visibility: 0.9 },
    12: { x: 0.62, y: 0.45, visibility: 0.9 },
  };

  processLandmarks(mockLandmarks);

  demoAnimationFrame = requestAnimationFrame(runDemoLoop);
}

function updateStatus(type, text) {
  if (elements.statusBadge) elements.statusBadge.className = `badge badge-${type}`;
  if (elements.statusText) elements.statusText.textContent = text;
}

function startSessionTimer() {
  if (timerInterval) clearInterval(timerInterval);
  state.metrics.sessionStartTime = Date.now();
  state.continuousSittingTime = 0;

  timerInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - state.metrics.sessionStartTime) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    if (elements.durationText) elements.durationText.textContent = `${mins}:${secs}`;

    // Feature: Micro-break check (triggers every 20 mins / 1200s)
    state.continuousSittingTime++;
    if (state.continuousSittingTime >= 1200) {
      addLog('🧘 Stretch Break Time! Stand up and stretch your shoulders.', 'warning');
      alert('🧘 Stretch Break Reminder!\nYou have been sitting for 20 minutes. Take 30 seconds to expand your chest!');
      state.continuousSittingTime = 0;
    }
  }, 1000);
}

function stopSessionTimer() {
  if (timerInterval) clearInterval(timerInterval);
  if (elements.durationText) elements.durationText.textContent = '00:00';
}

function addLog(message, type = 'info') {
  if (!elements.eventLog) return;
  const iconMap = {
    info: 'fa-circle-info',
    warning: 'fa-triangle-exclamation',
    danger: 'fa-circle-xmark',
    success: 'fa-circle-check',
  };

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const li = document.createElement('li');
  li.className = `log-item ${type}`;
  li.innerHTML = `<i class="fa-solid ${iconMap[type]}"></i> [${timeStr}] ${message}`;

  elements.eventLog.prepend(li);
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');

  if (currentTheme === 'light') {
    document.body.removeAttribute('data-theme');
    if (elements.themeToggleBtn) elements.themeToggleBtn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
  } else {
    document.body.setAttribute('data-theme', 'light');
    if (elements.themeToggleBtn) elements.themeToggleBtn.innerHTML = `<i class="fa-solid fa-sun"></i>`;
  }
}

// Feature: Global Helper to apply sensitivity presets ('strict', 'normal', 'relaxed')
window.applyPreset = function(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  state.thresholds.slouchSensPercent = preset.slouchPercent;
  state.thresholds.tiltAngleDeg = preset.tiltAngle;
  state.thresholds.alertDelaySec = preset.delaySec;

  if (elements.slouchSensInput) elements.slouchSensInput.value = preset.slouchPercent;
  if (elements.slouchSensVal) elements.slouchSensVal.textContent = `${preset.slouchPercent}%`;
  if (elements.tiltSensInput) elements.tiltSensInput.value = preset.tiltAngle;
  if (elements.tiltSensVal) elements.tiltSensVal.textContent = `${preset.tiltAngle}°`;
  if (elements.alertDelayInput) elements.alertDelayInput.value = preset.delaySec;
  if (elements.alertDelayVal) elements.alertDelayVal.textContent = `${preset.delaySec.toFixed(1)}s`;

  addLog(`Applied '${presetKey.toUpperCase()}' sensitivity preset.`, 'info');
};

// Feature: Export Session CSV Report
window.exportSessionCSV = function() {
  const duration = elements.durationText ? elements.durationText.textContent : '00:00';
  const score = elements.scoreText ? elements.scoreText.textContent : '100%';
  const slouchCount = state.metrics.slouchCount;

  const csvContent = "data:text/csv;charset=utf-8," 
    + "Session Duration,Posture Score,Total Slouches\n"
    + `"${duration}","${score}",${slouchCount}\n`;

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `posture_report_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  addLog('Session posture report exported as CSV.', 'success');
};
window.addEventListener('DOMContentLoaded', () => {
  const controlsPanel = document.querySelector('.controls-panel') || document.querySelector('#controls');
  if (controlsPanel) {
    const presetDiv = document.createElement('div');
    presetDiv.style.margin = '10px 0';
    presetDiv.innerHTML = `
      <p style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">Quick Presets:</p>
      <button onclick="applyPreset('strict')" style="margin-right: 5px; padding: 4px 8px;">Strict</button>
      <button onclick="applyPreset('normal')" style="margin-right: 5px; padding: 4px 8px;">Normal</button>
      <button onclick="applyPreset('relaxed')" style="padding: 4px 8px;">Relaxed</button>
    `;
    controlsPanel.prepend(presetDiv);
  }
});