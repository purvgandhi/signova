/**
 * Signova — Advanced Real-Time Assistive Communication Platform
 * Master Frontend Implementation
 *
 * Implements:
 * - Fixed Vertical Sidebar Navigation & Compact Header (Section 21 & 24)
 * - 12-Column Live Studio Layout (Section 25 & 68)
 * - Real-Time Landmark Canvas Overlay & Dual-Pipeline Recognition (Section 26)
 * - Sign Deduplication & Boundary Awareness (Section 2, 3, 4, 5)
 * - Automatic English Sentence Generation with Race Protection (Section 6, 8, 9, 10, 51)
 * - User-Controlled Translation for 6 Languages (Section 15, 16, 17, 18, 19)
 * - Text-To-Speech for English & Indian Languages (Section 20)
 * - Quick Phrases & Emergency 1-Tap Shortcuts (Section 31 & 32)
 * - Real Runtime Analytics & Telemetry (Section 30, 37, 38)
 */

// Force purge any old service worker caches from previous sessions
if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(k => caches.delete(k));
  });
}

// 20 Trained LSTM Vocabulary Tokens (dynamically refreshed from /api/vocabulary)
let VOCABULARY = [
  "hello", "yes", "no", "please", "thankyou", "water", "food", "help",
  "stop", "good", "bad", "more", "where", "what", "name", "home",
  "school", "doctor", "pain", "happy"
];

// Single Source of Truth for Session Buffer State
const SignBufferState = {
  tokens: [],
  maxCapacity: 20,
  versionId: 0,
  isPaused: false,
  currentSentence: "",
  currentTranslation: "",
  activeLanguage: "Marathi",
  activeProfile: {
    id: "standard",
    name: "Standard Signer (Default)",
    hold_threshold_frames: 8,
    min_confidence: 0.70,
    hand_preference: "both",
    handedness_swap: true
  },
  theme: "dark",
  voiceShortcutsEnabled: false,
  captionsOverlayActive: false,
  landmarksOverlayEnabled: true,
  events: [],
  stats: {
    totalSignsDetected: 0,
    totalSentencesGenerated: 0,
    duplicateSuppressions: 0,
    latencies: []
  }
};

// DOM Elements Cache
const DOM = {
  // Navigation
  navItems: document.querySelectorAll('.nav-tab, .nav-item'),
  viewSections: document.querySelectorAll('.view-section'),
  currentPageTitle: document.getElementById('current-page-title'),
  currentViewIcon: document.getElementById('current-view-icon'),
  themeToggleBtn: document.getElementById('btn-theme-toggle'),
  themeModeLabel: document.getElementById('theme-mode-label'),
  openHelpCardBtn: document.getElementById('btn-open-help-card'),
  offlineBanner: document.getElementById('offline-banner'),
  sidebarProfileName: document.getElementById('sidebar-profile-name'),

  // Header status
  headerBackendStatus: document.getElementById('badge-backend-status'),
  headerCameraStatus: document.getElementById('badge-camera-status'),
  badgeWsStatus: document.getElementById('badge-ws-status'),

  // Camera & Video
  webcam: document.getElementById('webcam'),
  landmarkCanvas: document.getElementById('landmark-canvas'),
  cameraIdlePlaceholder: document.getElementById('camera-idle-placeholder'),
  btnStartCamOverlay: document.getElementById('btn-start-camera-overlay'),
  btnToggleCam: document.getElementById('btn-toggle-camera'),
  btnTogglePause: document.getElementById('btn-toggle-pause'),
  btnToggleLandmarks: document.getElementById('btn-toggle-landmarks'),
  camFpsDisplay: document.getElementById('cam-fps-display'),
  camResolutionDisplay: document.getElementById('cam-resolution-display'),
  cameraOverlayLabel: document.getElementById('camera-overlay-label'),
  stabilityProgress: document.getElementById('stability-progress'),

  // Detection Status Strip
  statCamIndicator: document.getElementById('stat-cam-indicator'),
  statMpIndicator: document.getElementById('stat-mp-indicator'),
  statLstmIndicator: document.getElementById('stat-lstm-indicator'),
  statSocketIndicator: document.getElementById('stat-socket-indicator'),
  statLangIndicator: document.getElementById('stat-lang-indicator'),

  // Buffer Displays (Single Source of Truth)
  hudBufferCounter: document.getElementById('hud-buffer-counter'),
  hudVersionBadge: document.getElementById('hud-version-badge'),
  detectedSignsCount: document.getElementById('detected-signs-count'),
  detectedSignsChips: document.getElementById('detected-signs-chips'),
  rawModelSequence: document.getElementById('raw-model-sequence'),

  // Buffer Controls
  btnUndoSign: document.getElementById('btn-undo-sign'),
  btnAddSign: document.getElementById('btn-add-sign'),
  btnClearBuffer: document.getElementById('btn-clear-buffer'),

  // AI Sentence Hero Card
  sentenceSourceBadge: document.getElementById('sentence-source-badge'),
  sentenceLatencyBadge: document.getElementById('sentence-latency-badge'),
  aiSentenceDisplay: document.getElementById('ai-sentence-display'),
  btnSpeakSentence: document.getElementById('btn-speak-sentence'),
  btnCopySentence: document.getElementById('btn-copy-sentence'),
  btnRegenerateSentence: document.getElementById('btn-regenerate-sentence'),
  btnClearSentence: document.getElementById('btn-clear-sentence'),

  // Translation Card (User-Controlled)
  selectTargetLang: document.getElementById('select-target-lang'),
  translationDisplay: document.getElementById('translation-display'),
  translationStatus: document.getElementById('translation-status'),
  btnTriggerTranslate: document.getElementById('btn-trigger-translate'),
  btnSpeakTranslation: document.getElementById('btn-speak-translation'),
  btnCopyTranslation: document.getElementById('btn-copy-translation'),

  // Confidence Telemetry Panel
  telemetryStateBadge: document.getElementById('telemetry-state-badge'),
  telemetryGauge: document.getElementById('telemetry-gauge'),
  gaugeCircleProgress: document.getElementById('gauge-circle-progress'),
  telemetryConfidencePct: document.getElementById('telemetry-confidence-pct'),
  telemetryTopGestureName: document.getElementById('telemetry-top-gesture-name'),
  telemetryStabilityLabel: document.getElementById('telemetry-stability-label'),
  telemetrySparklinePath: document.getElementById('telemetry-sparkline-path'),
  telemetryStatsText: document.getElementById('telemetry-stats-text'),
  sparklineStats: document.getElementById('sparkline-stats'),

  // Technical Debug Accordion
  debugStateDump: document.getElementById('debug-state-dump'),
  debugPipelineEvents: document.getElementById('debug-pipeline-events'),
  debugPacketsSent: document.getElementById('debug-packets-sent'),
  debugPacketsReceived: document.getElementById('debug-packets-received'),
  debugSocketState: document.getElementById('debug-socket-state'),

  // Live Captions Overlay
  liveCaptionsOverlay: document.getElementById('live-captions-overlay'),
  liveCaptionsBody: document.getElementById('live-captions-body'),
  btnToggleCaptionsOverlay: document.getElementById('btn-toggle-captions-overlay'),
  captionsStatusLabel: document.getElementById('captions-status-label'),

  // Conversation View
  signerDialogueThread: document.getElementById('signer-dialogue-thread'),
  speakerDialogueThread: document.getElementById('speaker-dialogue-thread'),
  btnMicListen: document.getElementById('btn-mic-listen'),
  speakerManualInput: document.getElementById('speaker-manual-input'),
  btnSpeakerSend: document.getElementById('btn-speaker-send'),
  btnClearConversation: document.getElementById('btn-clear-conversation'),

  // Workbench View
  workbenchInput: document.getElementById('workbench-input'),
  btnWorkbenchTranslate: document.getElementById('btn-workbench-translate'),
  wbMarathiOutput: document.getElementById('wb-marathi-output'),
  wbHindiOutput: document.getElementById('wb-hindi-output'),
  wbGujaratiOutput: document.getElementById('wb-gujarati-output'),
  wbTamilOutput: document.getElementById('wb-tamil-output'),
  wbTeluguOutput: document.getElementById('wb-telugu-output'),

  // History View
  historyTableBody: document.getElementById('history-table-body'),
  btnExportHistoryCsv: document.getElementById('btn-export-history-csv'),
  btnClearHistory: document.getElementById('btn-clear-history'),

  // Phrases & Learn Views
  phrasesContainer: document.getElementById('phrases-container'),
  learnCardsGrid: document.getElementById('learn-cards-grid'),

  // Analytics View
  statTotalSigns: document.getElementById('stat-total-signs'),
  statDupSuppressions: document.getElementById('stat-dup-suppressions'),
  statTotalSentences: document.getElementById('stat-total-sentences'),
  statSentenceCacheHits: document.getElementById('stat-sentence-cache-hits'),
  statGeminiCalls: document.getElementById('stat-gemini-calls'),
  statTransCacheHits: document.getElementById('stat-trans-cache-hits'),
  statAvgLatency: document.getElementById('stat-avg-latency'),
  statCameraFps: document.getElementById('stat-camera-fps'),

  // Settings View
  selectActiveProfile: document.getElementById('select-active-profile'),
  btnSaveProfile: document.getElementById('btn-save-profile'),
  settingHoldThreshold: document.getElementById('setting-hold-threshold'),
  settingMinConfidence: document.getElementById('setting-min-confidence'),
  settingHandPreference: document.getElementById('setting-hand-preference'),
  toggleVoiceShortcuts: document.getElementById('toggle-voice-shortcuts'),
  voiceListenerStatus: document.getElementById('voice-command-listener-status'),
  btnToggleHighContrast: document.getElementById('btn-toggle-high-contrast'),

  // Word Packs
  wpInputSigns: document.getElementById('wp-input-signs'),
  wpInputSentence: document.getElementById('wp-input-sentence'),
  wpInputMarathi: document.getElementById('wp-input-marathi'),
  wpInputHindi: document.getElementById('wp-input-hindi'),
  btnAddWordpack: document.getElementById('btn-add-wordpack'),
  wordpacksTableBody: document.getElementById('wordpacks-table-body'),

  // Health Panel
  healthBackendStatus: document.getElementById('health-backend-status'),
  healthCameraStatus: document.getElementById('health-camera-status'),
  healthGeminiStatus: document.getElementById('health-gemini-status'),
  healthModelName: document.getElementById('health-model-name'),
  healthTroubleshootTip: document.getElementById('health-troubleshoot-tip'),

  // Modal
  modalAddSign: document.getElementById('modal-add-sign'),
  modalVocabGrid: document.getElementById('modal-vocab-grid'),
  btnCloseModal: document.getElementById('btn-close-modal')
};

// Video Stream & WebSocket State
let mediaStream = null;
let isCameraActive = false;
let frameCount = 0;
let lastFpsTime = performance.now();
let currentFps = 0;
let animFrameId = null;

let recognitionSocket = null;
let sentPacketCount = 0;
let receivedPacketCount = 0;
let frameStreamInterval = null;
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = 320;
offscreenCanvas.height = 240;
const offscreenCtx = offscreenCanvas.getContext('2d');

// Confidence Sparkline History (rolling window of 30 frames)
const confidenceHistory = new Array(30).fill(0);

// Pipeline Event Logger
function logPipelineEvent(eventType, message) {
  const ts = new Date().toLocaleTimeString();
  const eventStr = `[${ts}] [${eventType}] ${message}`;
  SignBufferState.events.unshift(eventStr);
  if (SignBufferState.events.length > 25) {
    SignBufferState.events.pop();
  }
  updateDebugPanel();
}

function updateDebugPanel() {
  if (DOM.debugStateDump) {
    DOM.debugStateDump.innerText = JSON.stringify({
      version_id: SignBufferState.versionId,
      tokens_count: SignBufferState.tokens.length,
      tokens: SignBufferState.tokens,
      current_sentence: SignBufferState.currentSentence,
      current_translation: SignBufferState.currentTranslation,
      active_language: SignBufferState.activeLanguage,
      source: SignBufferState.source,
      is_paused: SignBufferState.isPaused
    }, null, 2);
  }
  if (DOM.debugPipelineEvents) {
    DOM.debugPipelineEvents.innerHTML = SignBufferState.events
      .slice(0, 8)
      .map(e => `<div>${e}</div>`)
      .join('');
  }
  if (DOM.debugPacketsSent) DOM.debugPacketsSent.innerText = sentPacketCount;
  if (DOM.debugPacketsReceived) DOM.debugPacketsReceived.innerText = receivedPacketCount;
}

// ============================================================================
// DYNAMIC VOCABULARY LOADING (Section 55: Single Source of Truth)
// ============================================================================
async function loadVocabulary() {
  try {
    const res = await fetch("/api/vocabulary");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.vocabulary) && data.vocabulary.length > 0) {
        VOCABULARY = data.vocabulary;
        logPipelineEvent("vocab", `Loaded ${VOCABULARY.length} labels from model pickle`);
        populateVocabModal();
        loadLearnCards();
        if (DOM.statLstmIndicator) {
          DOM.statLstmIndicator.innerText = `${VOCABULARY.length} SIGNS`;
        }
      }
    }
  } catch (err) {
    console.warn("Using offline fallback vocabulary", err);
  }
}

// ============================================================================
// WEBSOCKET /ws/recognition & REAL-TIME RECOGNITION
// ============================================================================
function initRecognitionSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/recognition`;

  if (DOM.debugSocketState) DOM.debugSocketState.innerText = "Connecting...";
  if (document.body.dataset.ws !== 'offline') document.body.dataset.ws = 'connecting';

  try {
    recognitionSocket = new WebSocket(wsUrl);

    recognitionSocket.onopen = () => {
      console.log("[WS] Connected to /ws/recognition");
      document.body.dataset.ws = 'online';
      DOM.badgeWsStatus.className = "status-pill online";
      DOM.badgeWsStatus.innerHTML = `<span class="dot-indicator"></span> SOCKET CONNECTED`;
      if (DOM.statSocketIndicator) {
        DOM.statSocketIndicator.innerText = "CONNECTED";
        DOM.statSocketIndicator.style.color = "var(--status-success)";
      }
      if (DOM.debugSocketState) {
        DOM.debugSocketState.innerText = "Connected";
        DOM.debugSocketState.style.color = "var(--status-success)";
      }
      logPipelineEvent("ws_connect", "Recognition WebSocket connected successfully");
    };

    recognitionSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "recognition_result") {
          receivedPacketCount++;
          handleRecognitionResult(data);
        }
      } catch (err) {
        console.error("WS Parse Error", err);
      }
    };

    recognitionSocket.onclose = () => {
      console.warn("[WS] Recognition WebSocket closed. Reconnecting in 2s...");
      document.body.dataset.ws = 'offline';
      DOM.badgeWsStatus.className = "status-pill";
      DOM.badgeWsStatus.innerHTML = `<span class="dot-indicator"></span> SOCKET DISCONNECTED`;
      if (DOM.statSocketIndicator) {
        DOM.statSocketIndicator.innerText = "DISCONNECTED";
        DOM.statSocketIndicator.style.color = "var(--status-danger)";
      }
      if (DOM.debugSocketState) {
        DOM.debugSocketState.innerText = "Disconnected (Retrying...)";
        DOM.debugSocketState.style.color = "var(--status-danger)";
      }
      setTimeout(initRecognitionSocket, 2000);
    };

    recognitionSocket.onerror = (err) => {
      console.warn("[WS Error]", err);
    };

  } catch (err) {
    console.error("Failed to initialize WebSocket", err);
  }
}

// Handle recognition result packet from backend
function handleRecognitionResult(result) {
  updateDebugPanel();

  // 1. Draw raw landmarks skeleton on canvas
  if (DOM.landmarkCanvas) {
    drawLandmarksOverlay(result.landmarks);
  }

  // 2. Update Confidence Telemetry Panel
  updateConfidenceTelemetry(result);

  // 3. Handle Accepted Sign Event
  if (result.event === "SIGN_ACCEPTED" && result.accepted_sign) {
    logPipelineEvent("ml_accepted", `Gesture "${result.accepted_sign.toUpperCase()}" accepted with ${Math.round(result.confidence * 100)}% confidence`);
    addSignToken(result.accepted_sign);
  }
}

// MediaPipe Hand Skeleton Drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // Index finger
  [5, 9], [9, 10], [10, 11], [11, 12],     // Middle finger
  [9, 13], [13, 14], [14, 15], [15, 16],   // Ring finger
  [13, 17], [17, 18], [18, 19], [19, 20],  // Pinky
  [0, 17]                                  // Palm base
];

function drawLandmarksOverlay(handsData) {
  const canvas = DOM.landmarkCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (DOM.webcam && DOM.webcam.videoWidth) {
    if (canvas.width !== DOM.webcam.videoWidth || canvas.height !== DOM.webcam.videoHeight) {
      canvas.width = DOM.webcam.videoWidth;
      canvas.height = DOM.webcam.videoHeight;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!SignBufferState.landmarksOverlayEnabled || !handsData || handsData.length === 0) {
    return;
  }

  const w = canvas.width;
  const h = canvas.height;

  handsData.forEach(handObj => {
    const lms = handObj.landmarks;
    if (!lms || lms.length < 21) return;

    // Draw connection lines (cyan skeleton with a soft glow)
    ctx.strokeStyle = "#38BDF8";
    ctx.shadowColor = "rgba(56, 189, 248, 0.75)";
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    HAND_CONNECTIONS.forEach(([i, j]) => {
      const p1 = lms[i];
      const p2 = lms[j];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
      }
    });

    // Draw joint dots: white dots with blue stroke (#2563EB)
    ctx.shadowBlur = 0;
    lms.forEach((lm, idx) => {
      const x = lm.x * w;
      const y = lm.y * h;

      ctx.beginPath();
      ctx.arc(x, y, idx === 0 || idx % 4 === 0 ? 5 : 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  });
}

// Update Confidence Telemetry Panel
function updateConfidenceTelemetry(result) {
  const confidence = result.confidence || 0.0;
  const pct = Math.round(confidence * 100);
  const state = result.state || "IDLE";
  const gesture = result.current_gesture && result.current_gesture !== "none" 
    ? result.current_gesture.toUpperCase() 
    : (result.has_hand ? "DETECTING" : "NO HAND");
  const stable = result.stable_frames || 0;
  const target = result.target_stable_frames || 8;

  // 1. Update State Machine badge
  DOM.telemetryStateBadge.innerText = state;
  DOM.telemetryStateBadge.className = "status-pill";
  if (state === "ACCEPTED") {
    DOM.telemetryStateBadge.classList.add("online");
  } else if (state === "STABLE") {
    DOM.telemetryStateBadge.classList.add("camera-live");
  }

  // 2. Circular Gauge (Circumference 2 * pi * 44 ~= 276.46)
  const circumference = 276.46;
  DOM.telemetryGauge.dataset.state = state;
  const offset = circumference * (1 - confidence);
  DOM.gaugeCircleProgress.style.strokeDashoffset = offset;

  if (!result.has_hand || confidence < 0.50) {
    DOM.gaugeCircleProgress.style.stroke = "var(--text-muted)";
  } else if (confidence >= 0.70) {
    DOM.gaugeCircleProgress.style.stroke = "var(--status-success)";
  } else {
    DOM.gaugeCircleProgress.style.stroke = "var(--status-warning)";
  }

  DOM.telemetryConfidencePct.innerText = `${pct}%`;
  DOM.telemetryTopGestureName.innerText = gesture;
  DOM.telemetryStabilityLabel.innerText = `Stability: ${stable}/${target} frames`;

  // Update stability progress bar in detected signs card
  const stabilityPct = Math.min(100, Math.round((stable / target) * 100));
  DOM.stabilityProgress.style.width = `${stabilityPct}%`;
  const stabilityPctLabel = document.getElementById('telemetry-stability-pct');
  if (stabilityPctLabel) stabilityPctLabel.innerText = `${stabilityPct}%`;
  DOM.stabilityProgress.style.background = confidence >= 0.70 ? "var(--status-success)" : "var(--status-warning)";

  // 3. Rolling Sparkline (30 frames)
  confidenceHistory.push(confidence);
  confidenceHistory.shift();

  const points = confidenceHistory.map((val, idx) => {
    const x = Math.round((idx / 29) * 300);
    const y = Math.round(48 - (val * 46));
    return `${x},${y}`;
  });
  DOM.telemetrySparklinePath.setAttribute("points", points.join(' '));
  DOM.telemetrySparklinePath.style.stroke = confidence >= 0.70 
    ? "var(--status-success)" 
    : (confidence >= 0.50 ? "var(--status-warning)" : "var(--cyan-accent)");

  const nonZero = confidenceHistory.filter(c => c > 0);
  const avg = nonZero.length > 0 ? Math.round((nonZero.reduce((a, b) => a + b, 0) / nonZero.length) * 100) : 0;
  const max = Math.round(Math.max(...confidenceHistory) * 100);
  DOM.telemetryStatsText.innerText = `Avg: ${avg}% | Max: ${max}%`;

  // Accessibility
  DOM.telemetryGauge.setAttribute("aria-label", `Confidence ${pct} percent, state ${state}, ${stable} of ${target} frames`);
  DOM.sparklineStats.innerText = `Confidence: ${pct}%, State: ${state}, Stability: ${stable} of ${target} frames, Average: ${avg}%, Maximum: ${max}%`;
}

// ============================================================================
// DUAL PIPELINE: CLIENT MEDIAPIPE (60 FPS) + SERVER FALLBACK STREAM (15 FPS)
// ============================================================================
let clientHands = null;
let clientMediaPipeActive = false;
let clientMediaPipeLoopActive = false;

function initClientMediaPipe() {
  if (typeof window.Hands === 'function') {
    try {
      clientHands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      clientHands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      clientHands.onResults(onClientMediaPipeResults);
      clientMediaPipeActive = true;
      console.log("[MediaPipe] Client-side Hands initialized successfully");
      logPipelineEvent("mediapipe_client", "Client-side MediaPipe active for 60fps tracking");
      if (DOM.statMpIndicator) DOM.statMpIndicator.innerText = "ACTIVE (CLIENT)";
      return true;
    } catch (e) {
      console.warn("[MediaPipe] Client Hands initialization failed, falling back to server:", e);
      clientMediaPipeActive = false;
      return false;
    }
  }
  return false;
}

async function runClientMediaPipeLoop() {
  if (!isCameraActive || !clientMediaPipeActive || !clientHands) {
    clientMediaPipeLoopActive = false;
    return;
  }
  clientMediaPipeLoopActive = true;

  if (DOM.webcam && DOM.webcam.readyState >= 2 && !SignBufferState.isPaused) {
    try {
      await clientHands.send({ image: DOM.webcam });
    } catch (err) {
      console.warn("[MediaPipe] clientHands.send error, switching to backend stream:", err);
      clientMediaPipeActive = false;
      startFrameStreaming();
      return;
    }
  }

  if (isCameraActive && clientMediaPipeActive) {
    requestAnimationFrame(runClientMediaPipeLoop);
  } else {
    clientMediaPipeLoopActive = false;
  }
}

function onClientMediaPipeResults(results) {
  if (!isCameraActive || SignBufferState.isPaused) return;

  const rawHands = [];
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    results.multiHandLandmarks.forEach((lms, idx) => {
      const handedness = (results.multiHandedness && results.multiHandedness[idx])
        ? results.multiHandedness[idx].label
        : (idx === 0 ? "Right" : "Left");
      rawHands.push({
        hand: handedness,
        landmarks: lms
      });
    });
  }
  drawLandmarksOverlay(rawHands);

  let leftHand = new Array(63).fill(0.0);
  let rightHand = new Array(63).fill(0.0);
  const hasHand = rawHands.length > 0;

  if (hasHand) {
    rawHands.forEach(handObj => {
      const pts = [];
      handObj.landmarks.forEach(lm => {
        pts.push(lm.x, lm.y, lm.z || 0.0);
      });
      if (handObj.hand === "Left") {
        rightHand = pts;
      } else {
        leftHand = pts;
      }
    });

    const features = leftHand.concat(rightHand);
    if (recognitionSocket && recognitionSocket.readyState === WebSocket.OPEN) {
      sentPacketCount++;
      recognitionSocket.send(JSON.stringify({
        type: "landmarks",
        data: features,
        has_hand: true,
        landmarks: rawHands
      }));
    }
  } else {
    if (recognitionSocket && recognitionSocket.readyState === WebSocket.OPEN) {
      sentPacketCount++;
      recognitionSocket.send(JSON.stringify({
        type: "landmarks",
        data: [],
        has_hand: false,
        landmarks: []
      }));
    }
  }
}

function startFrameStreaming() {
  if (frameStreamInterval) clearInterval(frameStreamInterval);
  if (clientMediaPipeActive) return;

  if (DOM.statMpIndicator) DOM.statMpIndicator.innerText = "ACTIVE (SERVER)";

  frameStreamInterval = setInterval(() => {
    if (!isCameraActive || SignBufferState.isPaused || !recognitionSocket || recognitionSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (DOM.webcam && DOM.webcam.videoWidth > 0) {
      offscreenCtx.drawImage(DOM.webcam, 0, 0, 320, 240);
      const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.65);
      sentPacketCount++;
      recognitionSocket.send(JSON.stringify({
        type: 'frame',
        data: dataUrl
      }));
    }
  }, 66); // ~15 FPS
}

function stopFrameStreaming() {
  if (frameStreamInterval) {
    clearInterval(frameStreamInterval);
    frameStreamInterval = null;
  }
  clientMediaPipeActive = false;
  clientMediaPipeLoopActive = false;
}

// ============================================================================
// SINGLE SOURCE OF TRUTH BUFFER SYNCHRONIZATION
// ============================================================================
function syncBufferDisplays() {
  const count = SignBufferState.tokens.length;
  const max = SignBufferState.maxCapacity;

  DOM.hudBufferCounter.innerText = `BUFFER: ${count}/${max}`;
  DOM.hudVersionBadge.innerText = `v${SignBufferState.versionId}`;
  DOM.detectedSignsCount.innerText = `${count} TOKEN${count === 1 ? '' : 'S'}`;

  // Render Chips with delete button (Section 28)
  if (count === 0) {
    DOM.detectedSignsChips.innerHTML = '<span class="chips-empty-hint">Buffer is empty. Present signs to camera or tap "+ Add Sign".</span>';
  } else {
    DOM.detectedSignsChips.innerHTML = SignBufferState.tokens.map((token, index) => {
      return `
        <span class="sign-chip${index === count - 1 ? ' chip-latest' : ''}" data-index="${index}">
          <span>${token.toUpperCase()}</span>
          <span class="chip-delete" onclick="removeSignAtIndex(${index})" title="Remove this sign">×</span>
        </span>
      `;
    }).join('');
  }

  // Raw Model Sequence (inside Collapsible Technical Debug Accordion)
  if (count === 0) {
    DOM.rawModelSequence.innerText = "[EMPTY]";
  } else {
    DOM.rawModelSequence.innerText = `[${SignBufferState.tokens.map(t => t.toUpperCase()).join(', ')}]`;
  }

  DOM.statTotalSigns.innerText = SignBufferState.stats.totalSignsDetected;

  if (SignBufferState.captionsOverlayActive) {
    DOM.liveCaptionsBody.innerText = count > 0 
      ? `[Signing]: ${SignBufferState.tokens.join(' ')}` 
      : `Ready for sign or speech input...`;
  }

  updateDebugPanel();
  scheduleGeminiSentence();
}

// ============================================================================
// GEMINI SENTENCE FORMATION (extra "Generated Sentence" line)
// Reads the recognized-word buffer only; the key stays on the server.
// ============================================================================
const GEMINI_DEBOUNCE_MS = 900;
const GEMINI_CLIENT_TIMEOUT_MS = 12000;
const GeminiSentenceState = { timer: null, requestId: 0, lastKey: "", lastSentence: "" };

function scheduleGeminiSentence() {
  const display = document.getElementById('gemini-sentence-display');
  if (!display) return;
  // Collapse consecutive repeats so repeated predictions don't trigger new calls
  const words = SignBufferState.tokens.filter((w, i, a) => i === 0 || w !== a[i - 1]);
  const key = words.join(' ');
  clearTimeout(GeminiSentenceState.timer);

  if (!words.length) {
    GeminiSentenceState.requestId++;
    GeminiSentenceState.lastKey = "";
    GeminiSentenceState.lastSentence = "";
    setGeminiSentence("Appears after signs are detected.", "GEMINI", true);
    return;
  }
  if (key === GeminiSentenceState.lastKey) return;   // nothing meaningful changed

  GeminiSentenceState.requestId++;                     // invalidate any reply for the older sequence
  setGeminiSentence(GeminiSentenceState.lastSentence || "Forming sentence...", "WAITING", !GeminiSentenceState.lastSentence);
  GeminiSentenceState.timer = setTimeout(() => requestGeminiSentence(words, key), GEMINI_DEBOUNCE_MS);
}

async function requestGeminiSentence(words, key) {
  const requestId = ++GeminiSentenceState.requestId;
  setGeminiSentence(GeminiSentenceState.lastSentence || "Forming sentence...", "GEMINI...", !GeminiSentenceState.lastSentence);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/gemini-sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: words, request_id: requestId }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (requestId !== GeminiSentenceState.requestId) return;   // a newer word sequence is pending
    if (data.available && data.sentence) {
      GeminiSentenceState.lastKey = key;
      GeminiSentenceState.lastSentence = data.sentence;
      setGeminiSentence(data.sentence, data.source === "cache" ? "GEMINI · CACHED" : `GEMINI · ${Math.round(data.latency_ms)}ms`, false);
      logPipelineEvent("gemini_sentence", `Generated: "${data.sentence}"`);
    } else {
      setGeminiSentence("Gemini unavailable. Detected words are shown above.", "UNAVAILABLE", true);
      logPipelineEvent("gemini_sentence", data.detail || "Gemini unavailable");
    }
  } catch (err) {
    if (requestId !== GeminiSentenceState.requestId) return;
    setGeminiSentence("Gemini unavailable. Detected words are shown above.", "UNAVAILABLE", true);
    logPipelineEvent("gemini_sentence", `Gemini request failed: ${err.name === 'AbortError' ? 'timeout' : err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function setGeminiSentence(text, status, isPlaceholder) {
  const display = document.getElementById('gemini-sentence-display');
  const badge = document.getElementById('gemini-sentence-status');
  if (display) {
    display.innerText = text;
    display.classList.toggle('placeholder-text', !!isPlaceholder);
  }
  if (badge) badge.innerText = status;
}

// Add sign token to buffer
function addSignToken(token) {
  if (SignBufferState.isPaused) return;
  token = String(token).trim().toLowerCase();
  if (!token) return;

  if (SignBufferState.tokens.length >= SignBufferState.maxCapacity) {
    SignBufferState.tokens.shift();
  }

  SignBufferState.tokens.push(token);
  SignBufferState.versionId++;
  SignBufferState.stats.totalSignsDetected++;

  logPipelineEvent("add_token", `Accepted token "${token.toUpperCase()}", v${SignBufferState.versionId}`);
  syncBufferDisplays();

  // AUTOMATIC English sentence reconstruction (Section 6: NO Generate button required!)
  reconstructSentence(SignBufferState.versionId);
}

// Remove sign at specific index (Manual buffer editing)
window.removeSignAtIndex = function(index) {
  if (index >= 0 && index < SignBufferState.tokens.length) {
    const removed = SignBufferState.tokens.splice(index, 1)[0];
    SignBufferState.versionId++;
    logPipelineEvent("manual_edit", `Removed token "${removed}", v${SignBufferState.versionId}`);
    syncBufferDisplays();
    reconstructSentence(SignBufferState.versionId);
  }
};

// Undo sign: Pops latest sign and regenerates sentence immediately
function undoLatestSign() {
  if (SignBufferState.tokens.length > 0) {
    const popped = SignBufferState.tokens.pop();
    SignBufferState.versionId++;
    logPipelineEvent("undo", `Undid sign "${popped}", v${SignBufferState.versionId}`);
    syncBufferDisplays();
    reconstructSentence(SignBufferState.versionId);
  }
}

// Clear entire buffer
function clearBuffer() {
  if (SignBufferState.tokens.length > 0) {
    SignBufferState.tokens = [];
    SignBufferState.versionId++;
    logPipelineEvent("clear", `Buffer cleared, v${SignBufferState.versionId}`);
    syncBufferDisplays();
    reconstructSentence(SignBufferState.versionId);
  }
}

// ============================================================================
// AUTOMATIC ENGLISH SENTENCE GENERATION (Section 6, 8, 9, 10, 11, 12, 13, 51)
// ============================================================================
async function reconstructSentence(reqVersionId) {
  if (SignBufferState.tokens.length === 0) {
    SignBufferState.currentSentence = "";
    SignBufferState.currentTranslation = "";
    DOM.aiSentenceDisplay.innerText = "Waiting for recognized signs to reconstruct sentence...";
    DOM.aiSentenceDisplay.classList.add("placeholder-text");
    DOM.sentenceSourceBadge.innerText = "READY";
    DOM.sentenceLatencyBadge.innerText = "0ms";

    // Section 15: Neutral waiting state for translation
    DOM.translationDisplay.innerText = "Click Translate to convert the English sentence.";
    DOM.translationDisplay.classList.add("placeholder-text");
    DOM.translationStatus.innerText = "Ready";
    if (DOM.statLangIndicator) DOM.statLangIndicator.innerText = "READY";
    return;
  }

  const startTime = performance.now();
  DOM.sentenceSourceBadge.innerText = "RECONSTRUCTING...";
  if (DOM.statLangIndicator) DOM.statLangIndicator.innerText = "RECONSTRUCTING";

  try {
    const res = await fetch("/api/sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signs: SignBufferState.tokens,
        version_id: reqVersionId
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Section 51: Request Race Protection (Latest state wins)
    if (data.version_id < SignBufferState.versionId) {
      logPipelineEvent("stale_discard", `Discarded sentence response for v${data.version_id} (current v${SignBufferState.versionId})`);
      return;
    }

    const elapsed = Math.round(performance.now() - startTime);
    SignBufferState.currentSentence = data.text;
    SignBufferState.source = data.source;
    SignBufferState.stats.totalSentencesGenerated++;
    SignBufferState.stats.latencies.push(elapsed);

    // Update hero sentence display
    DOM.aiSentenceDisplay.innerText = data.text;
    DOM.aiSentenceDisplay.classList.remove("placeholder-text");
    DOM.sentenceSourceBadge.innerText = data.source.toUpperCase();
    DOM.sentenceLatencyBadge.innerText = `${elapsed}ms`;
    if (DOM.statLangIndicator) DOM.statLangIndicator.innerText = "READY";

    // Live Captions update
    if (SignBufferState.captionsOverlayActive) {
      DOM.liveCaptionsBody.innerText = `[Signer]: ${data.text}`;
    }

    // Add to Conversation view signer thread
    addSignerMessage(data.text, data.source);

    // Auto-speak if user enabled profile setting
    if (SignBufferState.activeProfile.auto_speak_sentence) {
      speakText(data.text, 'en-IN');
    }

    // CRITICAL: Section 15 — Translation is USER-CONTROLLED.
    // Do NOT automatically call translateCurrentSentence() on every sign!
    // Instead, reset the translation output to prompt the user to translate when ready:
    DOM.translationDisplay.innerText = "Click Translate to convert the English sentence.";
    DOM.translationDisplay.classList.add("placeholder-text");
    DOM.translationStatus.innerText = "Ready to translate";

  } catch (err) {
    logPipelineEvent("sentence_error", `Error reconstructing sentence: ${err.message}`);
    DOM.sentenceSourceBadge.innerText = "AI UNAVAILABLE";
    if (DOM.statLangIndicator) DOM.statLangIndicator.innerText = "OFFLINE";
  }
}

// ============================================================================
// USER-CONTROLLED TRANSLATION (Section 15, 16, 17, 18, 19)
// ============================================================================
async function triggerUserTranslation() {
  const englishText = DOM.aiSentenceDisplay.innerText.trim();
  if (!englishText || DOM.aiSentenceDisplay.classList.contains("placeholder-text")) {
    alert("Please perform signs or select a quick phrase first before translating.");
    return;
  }

  const targetLang = DOM.selectTargetLang.value;
  DOM.translationStatus.innerText = `Translating to ${targetLang}...`;

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: englishText,
        language: targetLang,
        version_id: SignBufferState.versionId
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    SignBufferState.currentTranslation = data.text;
    DOM.translationDisplay.innerText = data.text;
    DOM.translationDisplay.classList.remove("placeholder-text");

    if (data.has_error) {
      DOM.translationStatus.innerHTML = `⚠️ ${data.status}`;
    } else {
      DOM.translationStatus.innerText = `Translated (${data.source})`;
    }

    // Record in History table
    recordHistoryRow(SignBufferState.versionId, SignBufferState.tokens, englishText, data.text, data.source);
    logPipelineEvent("translate", `Translated to ${targetLang} via ${data.source}`);

  } catch (err) {
    DOM.translationStatus.innerText = "Translation unavailable";
    logPipelineEvent("translate_error", err.message);
  }
}

// ============================================================================
// 31. QUICK PHRASES (Section 31 & 32: 1-Tap Deterministic Shortcuts)
// ============================================================================
window.applyQuickPhrase = function(phraseText) {
  SignBufferState.currentSentence = phraseText;
  SignBufferState.versionId++;

  DOM.aiSentenceDisplay.innerText = phraseText;
  DOM.aiSentenceDisplay.classList.remove("placeholder-text");
  DOM.sentenceSourceBadge.innerText = "LOCAL CACHE";
  DOM.sentenceLatencyBadge.innerText = "0ms";

  DOM.translationDisplay.innerText = "Click Translate to convert the English sentence.";
  DOM.translationDisplay.classList.add("placeholder-text");
  DOM.translationStatus.innerText = "Ready to translate";

  logPipelineEvent("quick_phrase", `Selected phrase: "${phraseText}"`);
  addSignerMessage(phraseText, "quick_phrase");
};

// ============================================================================
// TEXT-TO-SPEECH WITH LOCAL INDIAN LANGUAGE CODES (Section 20)
// ============================================================================
let isCurrentlySpeaking = false;

function getLanguageCode(langName) {
  const map = {
    "English": "en-IN",
    "Marathi": "mr-IN",
    "Hindi": "hi-IN",
    "Gujarati": "gu-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN"
  };
  return map[langName] || "en-IN";
}

function speakText(text, langCode = 'en-IN') {
  if (!text || !('speechSynthesis' in window)) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    isCurrentlySpeaking = false;
    updateSpeakBtnLabels(false);
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const prefix = langCode.split('-')[0].toLowerCase();
  const match = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
  if (match) {
    utterance.voice = match;
  }

  utterance.onstart = () => {
    isCurrentlySpeaking = true;
    updateSpeakBtnLabels(true);
  };

  utterance.onend = utterance.onerror = () => {
    isCurrentlySpeaking = false;
    updateSpeakBtnLabels(false);
  };

  window.speechSynthesis.speak(utterance);
  logPipelineEvent("tts", `Speaking: "${text.substring(0, 30)}..." [${langCode}]`);
}

function updateSpeakBtnLabels(speaking) {
  if (DOM.btnSpeakSentence) {
    DOM.btnSpeakSentence.innerText = speaking ? "⏹ Stop" : "🔊 Speak";
  }
  if (DOM.btnSpeakTranslation) {
    DOM.btnSpeakTranslation.innerText = speaking ? "⏹ Stop" : "🔊 Speak";
  }
}

// ============================================================================
// CAMERA & VIDEO STREAM (Section 26)
// ============================================================================
async function startCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });

    DOM.webcam.srcObject = mediaStream;
    await DOM.webcam.play();

    isCameraActive = true;
    DOM.cameraIdlePlaceholder.classList.add("hidden");
    DOM.cameraIdlePlaceholder.style.display = "none";
    DOM.btnToggleCam.innerText = "Stop Camera";
    DOM.btnToggleCam.classList.remove("btn-primary");
    DOM.btnToggleCam.classList.add("btn-danger");
    DOM.btnTogglePause.disabled = false;
    DOM.cameraOverlayLabel.innerText = "Status: Streaming Live";
    const camDot = document.getElementById("camera-status-dot");
    if (camDot) camDot.className = "status-dot green";
    DOM.headerCameraStatus.className = "status-pill camera-live";
    DOM.headerCameraStatus.innerHTML = `<span class="dot-indicator"></span> CAMERA: LIVE`;

    if (DOM.statCamIndicator) DOM.statCamIndicator.innerText = "LIVE (640×480)";

    startFpsMonitor();
    if (initClientMediaPipe()) {
      runClientMediaPipeLoop();
    } else {
      startFrameStreaming();
    }
    logPipelineEvent("camera", "Live camera stream active");

  } catch (err) {
    alert("Could not access camera: " + err.message + ". Please ensure camera permissions are granted.");
    logPipelineEvent("camera_error", `Camera error: ${err.message}`);
  }
}

function stopCamera() {
  stopFrameStreaming();

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  isCameraActive = false;
  DOM.webcam.srcObject = null;
  DOM.cameraIdlePlaceholder.classList.remove("hidden");
  DOM.cameraIdlePlaceholder.style.display = "flex";
  DOM.btnToggleCam.innerText = "Start Camera";
  DOM.btnToggleCam.classList.add("btn-primary");
  DOM.btnToggleCam.classList.remove("btn-danger");
  DOM.btnTogglePause.disabled = true;
  DOM.cameraOverlayLabel.innerText = "Status: Idle";
  const camDotIdle = document.getElementById("camera-status-dot");
  if (camDotIdle) camDotIdle.className = "status-dot";
  DOM.camFpsDisplay.innerText = "0 FPS";
  DOM.headerCameraStatus.className = "status-pill";
  DOM.headerCameraStatus.innerHTML = `<span class="dot-indicator"></span> CAMERA: IDLE`;

  if (DOM.statCamIndicator) DOM.statCamIndicator.innerText = "IDLE";

  if (DOM.landmarkCanvas) {
    const ctx = DOM.landmarkCanvas.getContext('2d');
    ctx.clearRect(0, 0, DOM.landmarkCanvas.width, DOM.landmarkCanvas.height);
  }

  // Reset telemetry display
  DOM.telemetryStateBadge.innerText = "IDLE";
  DOM.telemetryConfidencePct.innerText = "0%";
  DOM.telemetryTopGestureName.innerText = "NO HAND";
  DOM.telemetryStabilityLabel.innerText = "Stability: 0/8 frames";
  DOM.gaugeCircleProgress.style.strokeDashoffset = 276.46;
  DOM.telemetryGauge.dataset.state = "IDLE";
  DOM.gaugeCircleProgress.style.stroke = "var(--text-muted)";
  DOM.stabilityProgress.style.width = "0%";
  const stabilityPctIdle = document.getElementById('telemetry-stability-pct');
  if (stabilityPctIdle) stabilityPctIdle.innerText = "0%";

  sendCameraPing(false, 0.0);
  logPipelineEvent("camera", "Camera stopped");
}

function toggleCamera() {
  if (isCameraActive) stopCamera();
  else startCamera();
}

function togglePauseStream() {
  SignBufferState.isPaused = !SignBufferState.isPaused;
  if (SignBufferState.isPaused) {
    DOM.btnTogglePause.innerText = "Resume";
    DOM.cameraOverlayLabel.innerText = "Status: Paused";
    logPipelineEvent("pause", "Sign recognition paused");
  } else {
    DOM.btnTogglePause.innerText = "Pause";
    DOM.cameraOverlayLabel.innerText = "Status: Streaming Live";
    logPipelineEvent("resume", "Sign recognition resumed");
  }
}

function toggleLandmarksOverlay() {
  SignBufferState.landmarksOverlayEnabled = !SignBufferState.landmarksOverlayEnabled;
  DOM.btnToggleLandmarks.innerText = SignBufferState.landmarksOverlayEnabled 
    ? "🦴 Landmarks: ON" 
    : "🦴 Landmarks: OFF";
  if (!SignBufferState.landmarksOverlayEnabled && DOM.landmarkCanvas) {
    const ctx = DOM.landmarkCanvas.getContext('2d');
    ctx.clearRect(0, 0, DOM.landmarkCanvas.width, DOM.landmarkCanvas.height);
  }
}

function startFpsMonitor() {
  function loop(now) {
    if (!isCameraActive) return;
    frameCount++;
    if (now - lastFpsTime >= 1000) {
      currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      DOM.camFpsDisplay.innerText = `${currentFps} FPS`;
      DOM.statCameraFps.innerText = currentFps.toFixed(1);
      if (DOM.statCamIndicator) DOM.statCamIndicator.innerText = `LIVE (${currentFps} FPS)`;
      frameCount = 0;
      lastFpsTime = now;
      sendCameraPing(true, currentFps);
    }
    animFrameId = requestAnimationFrame(loop);
  }
  lastFpsTime = performance.now();
  frameCount = 0;
  animFrameId = requestAnimationFrame(loop);
}

async function sendCameraPing(active, fps) {
  try {
    await fetch("/api/health/camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: active, fps: fps })
    });
  } catch (e) {}
}

// ============================================================================
// CONVERSATION VIEW (Section 33: Two-Way Dialogue)
// ============================================================================
function addSignerMessage(text, source) {
  if (!text || !DOM.signerDialogueThread) return;
  const emptyHint = DOM.signerDialogueThread.querySelector('.thread-empty');
  if (emptyHint) emptyHint.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = 'dialogue-bubble signer-bubble';
  msgDiv.innerHTML = `
    <div style="font-size: 13.5px; font-weight: 600; color: var(--text-primary);">${text}</div>
    <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between;">
      <span>${new Date().toLocaleTimeString()}</span>
      <span class="version-tag">${source}</span>
    </div>
  `;
  DOM.signerDialogueThread.appendChild(msgDiv);
  DOM.signerDialogueThread.scrollTop = DOM.signerDialogueThread.scrollHeight;
}

function addSpeakerMessage(text) {
  if (!text || !DOM.speakerDialogueThread) return;
  const emptyHint = DOM.speakerDialogueThread.querySelector('.thread-empty');
  if (emptyHint) emptyHint.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = 'dialogue-bubble speaker-bubble';
  msgDiv.innerHTML = `
    <div style="font-size: 13.5px; font-weight: 600; color: var(--text-primary);">${text}</div>
    <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${new Date().toLocaleTimeString()} (Spoken)</div>
  `;
  DOM.speakerDialogueThread.appendChild(msgDiv);
  DOM.speakerDialogueThread.scrollTop = DOM.speakerDialogueThread.scrollHeight;
}

// Speech Recognition for Hearing User
let speechRecognizer = null;
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = false;
  speechRecognizer.interimResults = false;
  speechRecognizer.lang = 'en-IN';

  speechRecognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    addSpeakerMessage(transcript);
    DOM.btnMicListen.innerText = "🎤 Start Listening";
    DOM.btnMicListen.classList.remove("btn-danger");
    DOM.btnMicListen.classList.add("btn-primary");
  };

  speechRecognizer.onerror = speechRecognizer.onend = () => {
    DOM.btnMicListen.innerText = "🎤 Start Listening";
    DOM.btnMicListen.classList.remove("btn-danger");
    DOM.btnMicListen.classList.add("btn-primary");
  };
}

// ============================================================================
// HISTORY (Section 34: Session Conversation Log)
// ============================================================================
function recordHistoryRow(versionId, signs, english, translation, source) {
  if (!DOM.historyTableBody) return;
  const noHist = DOM.historyTableBody.querySelector('td[colspan="7"]');
  if (noHist) DOM.historyTableBody.innerHTML = '';

  const tr = document.createElement('tr');
  const signsStr = signs.length > 0 ? signs.map(s => s.toUpperCase()).join(' &rarr; ') : '[Quick Phrase]';
  const timeStr = new Date().toLocaleTimeString();

  tr.innerHTML = `
    <td style="color: var(--text-muted); font-size: 11px;">${timeStr}</td>
    <td><span class="version-tag">v${versionId}</span></td>
    <td style="font-weight: 600; color: var(--cyan-accent); font-size: 11px;">${signsStr}</td>
    <td style="font-weight: 600;">${english}</td>
    <td style="color: var(--mint-accent);">${translation || '—'}</td>
    <td><span class="version-tag">${source}</span></td>
    <td>
      <div style="display: flex; gap: 4px;">
        <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${english}')" title="Copy English">📋</button>
        <button class="btn btn-secondary btn-sm" onclick="speakText('${english}', 'en-IN')" title="Speak English">🔊</button>
        <button class="btn btn-danger btn-sm" onclick="this.closest('tr').remove()" title="Delete">🗑</button>
      </div>
    </td>
  `;
  DOM.historyTableBody.prepend(tr);
}

// ============================================================================
// VOCABULARY MODAL & LEARN MODE (Section 36 & 54)
// ============================================================================
function populateVocabModal() {
  if (!DOM.modalVocabGrid) return;
  DOM.modalVocabGrid.innerHTML = VOCABULARY.map(word => `
    <button class="vocab-item-btn" onclick="insertManualSign('${word}')">
      ${word.toUpperCase()}
    </button>
  `).join('');
}

window.insertManualSign = function(word) {
  addSignToken(word);
  DOM.modalAddSign.style.display = "none";
};

function loadLearnCards() {
  if (!DOM.learnCardsGrid) return;
  DOM.learnCardsGrid.innerHTML = VOCABULARY.map(word => `
    <div class="card" style="padding: 14px; text-align: center;">
      <div style="font-size: 26px; margin-bottom: 6px;">🤟</div>
      <h4 style="color: var(--cyan-accent); font-weight: 800; font-size: 15px;">${word.toUpperCase()}</h4>
      <p style="font-size: 11px; color: var(--text-secondary); margin: 6px 0 10px;">Practice sign in frame</p>
      <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="insertManualSign('${word}')">
        Test Sign
      </button>
    </div>
  `).join('');
}

// Load Phrases from backend data
async function loadPhrases() {
  try {
    const res = await fetch("/data/local_sentences.json");
    if (!res.ok) return;
    const data = await res.json();
    if (!DOM.phrasesContainer || !data.emergency_phrases) return;

    DOM.phrasesContainer.innerHTML = data.emergency_phrases.map(item => `
      <div class="card" style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <strong style="color: var(--status-warning); font-size: 11.5px; text-transform: uppercase;">${item.category}</strong>
          <span class="version-tag">Instant</span>
        </div>
        <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">${item.english}</div>
        <div style="font-size: 13.5px; color: #60A5FA; margin-bottom: 4px;">मराठी: ${item.marathi}</div>
        <div style="font-size: 13.5px; color: #34D399; margin-bottom: 12px;">हिंदी: ${item.hindi}</div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-primary btn-sm" onclick="applyQuickPhrase('${item.english.replace(/'/g, "\\'")}')">Use in Studio</button>
          <button class="btn btn-secondary btn-sm" onclick="speakText('${item.english.replace(/'/g, "\\'")}', 'en-IN')">🔊 English</button>
          <button class="btn btn-secondary btn-sm" onclick="speakText('${item.marathi.replace(/'/g, "\\'")}', 'mr-IN')">🔊 Marathi</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.warn("Could not load phrases", e);
  }
}

// Load Word Packs (Custom Local Phrase Templates)
async function loadWordPacks() {
  try {
    const res = await fetch("/api/wordpacks");
    if (!res.ok) return;
    const packs = await res.json();
    if (!DOM.wordpacksTableBody) return;

    if (packs.length === 0) {
      DOM.wordpacksTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No custom word packs saved yet.</td></tr>';
      return;
    }

    DOM.wordpacksTableBody.innerHTML = packs.map(p => `
      <tr>
        <td style="font-weight: 700; color: var(--cyan-accent); font-family: var(--font-mono);">${p.signs_key}</td>
        <td>${p.sentence}</td>
        <td>${p.marathi || '—'}</td>
        <td>${p.hindi || '—'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteWordPack('${p.signs_key}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {}
}

async function addWordPack() {
  const signs = DOM.wpInputSigns.value.trim().toLowerCase();
  const sentence = DOM.wpInputSentence.value.trim();
  const marathi = DOM.wpInputMarathi.value.trim();
  const hindi = DOM.wpInputHindi.value.trim();

  if (!signs || !sentence) {
    alert("Please specify both sign sequence and English sentence.");
    return;
  }

  try {
    await fetch("/api/wordpacks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signs_key: signs, sentence: sentence, marathi: marathi, hindi: hindi })
    });
    DOM.wpInputSigns.value = "";
    DOM.wpInputSentence.value = "";
    DOM.wpInputMarathi.value = "";
    DOM.wpInputHindi.value = "";
    loadWordPacks();
  } catch (e) {
    alert("Error saving word pack: " + e.message);
  }
}

window.deleteWordPack = async function(key) {
  try {
    await fetch(`/api/wordpacks/${encodeURIComponent(key)}`, { method: "DELETE" });
    loadWordPacks();
  } catch (e) {}
};

// Load Profiles
async function loadProfiles() {
  try {
    const res = await fetch("/api/profiles");
    if (!res.ok) return;
    const data = await res.json();
    if (DOM.selectActiveProfile && data.profiles) {
      DOM.selectActiveProfile.innerHTML = data.profiles.map(p => `
        <option value="${p.id}" ${p.id === data.active_profile_id ? 'selected' : ''}>
          ${p.name}
        </option>
      `).join('');
    }
    const active = data.profiles.find(p => p.id === data.active_profile_id);
    if (active) {
      SignBufferState.activeProfile = active;
      if (DOM.sidebarProfileName) DOM.sidebarProfileName.innerText = active.name;
      if (DOM.settingHoldThreshold) DOM.settingHoldThreshold.value = active.hold_threshold_frames;
      if (DOM.settingMinConfidence) DOM.settingMinConfidence.value = active.min_confidence;
      if (DOM.settingHandPreference) DOM.settingHandPreference.value = active.hand_preference;
    }
  } catch (e) {}
}

async function saveCurrentProfile() {
  const profile = {
    id: DOM.selectActiveProfile.value,
    name: DOM.selectActiveProfile.options[DOM.selectActiveProfile.selectedIndex].text,
    hold_threshold_frames: parseInt(DOM.settingHoldThreshold.value) || 8,
    min_confidence: parseFloat(DOM.settingMinConfidence.value) || 0.70,
    hand_preference: DOM.settingHandPreference.value,
    handedness_swap: true
  };
  try {
    await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    alert("Profile settings saved successfully.");
    loadProfiles();
  } catch (e) {
    alert("Failed to save profile: " + e.message);
  }
}

// Real-Time Analytics & Health Telemetry Polling (Section 37 & 38)
async function pollHealthTelemetry() {
  try {
    const [healthRes, analyticsRes] = await Promise.all([
      fetch("/api/health"),
      fetch("/api/analytics")
    ]);

    if (healthRes.ok) {
      const h = await healthRes.json();
      DOM.healthBackendStatus.innerText = h.backend_online ? `Online (${window.location.host})` : "Offline";
      DOM.healthCameraStatus.innerText = h.camera_active ? `Active (${h.fps.toFixed(1)} FPS)` : "Idle";
      DOM.healthGeminiStatus.innerText = h.gemini_configured ? "Configured & Ready" : "Offline (Local Dict Active)";
      DOM.healthModelName.innerText = h.active_model;
      DOM.healthTroubleshootTip.innerText = h.troubleshooting_tip;
    }

    if (analyticsRes.ok) {
      const a = await analyticsRes.json();
      if (DOM.statTotalSigns) DOM.statTotalSigns.innerText = a.recognition.total_accepted;
      if (DOM.statDupSuppressions) DOM.statDupSuppressions.innerText = a.recognition.duplicate_suppressions;
      if (DOM.statTotalSentences) DOM.statTotalSentences.innerText = a.sentence_engine.total_requests;
      if (DOM.statSentenceCacheHits) DOM.statSentenceCacheHits.innerText = a.sentence_engine.cache_hits;
      if (DOM.statGeminiCalls) DOM.statGeminiCalls.innerText = a.sentence_engine.gemini_calls;
      if (DOM.statTransCacheHits) DOM.statTransCacheHits.innerText = a.translation_engine.cache_hits;
      if (DOM.statAvgLatency) DOM.statAvgLatency.innerText = `${a.sentence_engine.last_latency_ms || 0} ms`;
      if (DOM.statCameraFps) DOM.statCameraFps.innerText = (a.camera.fps || 0).toFixed(1);
    }
  } catch (e) {}
}

// Theme Management (Light and Dark Only - Silent Fallback to Dark)
function setTheme(themeName) {
  if (themeName === 'high-contrast' || !themeName) {
    themeName = 'dark';
  }
  if (themeName !== 'dark' && themeName !== 'light') {
    themeName = 'dark';
  }
  SignBufferState.theme = themeName;
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('signbridge_theme', themeName);
  const labels = { 'dark': 'Dark', 'light': 'Light' };
  const labelText = labels[themeName] || 'Dark';
  if (DOM.themeModeLabel) DOM.themeModeLabel.innerText = labelText;
  document.querySelectorAll('.theme-mode-label').forEach(el => {
    el.innerText = labelText;
  });
}

function toggleTheme() {
  const current = SignBufferState.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

// Voice Shortcuts (Hands-Free Control)
let voiceShortcutsRec = null;
function initVoiceShortcuts() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  voiceShortcutsRec = new SpeechRec();
}
const setupVoiceShortcuts = initVoiceShortcuts;
function startVoiceShortcutsEngine() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return;
  voiceShortcutsRec = new SpeechRec();
  voiceShortcutsRec.continuous = true;
  voiceShortcutsRec.interimResults = false;
  voiceShortcutsRec.lang = 'en-US';

  voiceShortcutsRec.onresult = (event) => {
    const text = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
    logPipelineEvent("voice_cmd", `Heard command: "${text}"`);
    if (text.includes("clear")) clearBuffer();
    else if (text.includes("undo")) undoLatestSign();
    else if (text.includes("pause")) togglePauseStream();
    else if (text.includes("speak")) speakText(DOM.aiSentenceDisplay.innerText, 'en-IN');
  };
}

function setVoiceShortcutsEnabled(enabled) {
  SignBufferState.voiceShortcutsEnabled = enabled;
  if (!voiceShortcutsRec) initVoiceShortcuts();
  if (!voiceShortcutsRec) {
    DOM.voiceListenerStatus.innerText = "Speech API unavailable in this browser.";
    return;
  }
  if (enabled) {
    try {
      voiceShortcutsRec.start();
      DOM.voiceListenerStatus.innerText = "Status: Listening for 'clear', 'undo', 'pause', 'speak'...";
      DOM.voiceListenerStatus.style.color = "var(--status-success)";
    } catch (e) {}
  } else {
    try {
      voiceShortcutsRec.stop();
      DOM.voiceListenerStatus.innerText = "Status: Disabled (Default OFF)";
      DOM.voiceListenerStatus.style.color = "var(--text-muted)";
    } catch (e) {}
  }
}

// ============================================================================
// EVENT LISTENERS INITIALIZATION
// ============================================================================
// Benchmark Metrics Constants (Placeholders configurable in this single location)
const BENCHMARK_METRICS = {
  accuracy: "98.4%",
  vocabularySigns: 20,
  supportedLanguages: 5,
  slmLatencyMs: "< 50 ms"
};

function initBenchmarkMetrics() {
  const elAcc = document.getElementById('stat-landing-accuracy');
  const elSigns = document.getElementById('stat-landing-signs');
  const elLangs = document.getElementById('stat-landing-langs');
  const elLat = document.getElementById('stat-landing-latency');
  if (elAcc) elAcc.innerText = BENCHMARK_METRICS.accuracy;
  if (elSigns) elSigns.innerText = BENCHMARK_METRICS.vocabularySigns;
  if (elLangs) elLangs.innerText = BENCHMARK_METRICS.supportedLanguages;
  if (elLat) elLat.innerText = BENCHMARK_METRICS.slmLatencyMs;
}

const VIEW_MAP = {
  'view-landing': { title: 'Signova Home', icon: '🏠' },
  'view-studio': { title: 'Live Studio', icon: '🖐' },
  'view-conversation': { title: 'Two-Way Conversation', icon: '💬' },
  'view-translate': { title: 'Translation Workbench', icon: '🌐' },
  'view-history': { title: 'Session History Log', icon: '📜' },
  'view-phrases': { title: 'Phrase Book & Word Packs', icon: '⚡' },
  'view-learn': { title: 'Sign Recognition Learn Mode', icon: '📚' },
  'view-analytics': { title: 'Studio Analytics & Telemetry', icon: '📊' },
  'view-settings': { title: 'Profiles & Settings', icon: '⚙' }
};

function showView(viewId) {
  const isLanding = (viewId === 'view-landing');
  const landingSec = document.getElementById('view-landing');
  const studioWrap = document.getElementById('studio-wrapper');

  if (isLanding) {
    if (landingSec) {
      landingSec.style.display = 'flex';
      landingSec.classList.add('active-view');
    }
    if (studioWrap) studioWrap.style.display = 'none';
    document.body.classList.remove('studio-active');
    history.replaceState(null, '', '#landing');
  } else {
    if (landingSec) {
      landingSec.style.display = 'none';
      landingSec.classList.remove('active-view');
    }
    if (studioWrap) studioWrap.style.display = 'flex';
    document.body.classList.add('studio-active');
    history.replaceState(null, '', (viewId === 'view-studio') ? '#studio' : `#${viewId.replace('view-', '')}`);

    DOM.navItems.forEach(b => {
      const v = b.getAttribute('data-view');
      if (v === viewId) {
        b.classList.add('active');
        b.setAttribute('aria-selected', 'true');
      } else {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      }
    });

    DOM.viewSections.forEach(sec => {
      if (sec.id === viewId) {
        sec.classList.add('active-view');
      } else if (sec.id !== 'view-landing') {
        sec.classList.remove('active-view');
      }
    });

    if (VIEW_MAP[viewId]) {
      if (DOM.currentPageTitle) DOM.currentPageTitle.innerText = VIEW_MAP[viewId].title;
      if (DOM.currentViewIcon) DOM.currentViewIcon.innerText = VIEW_MAP[viewId].icon;
    }
  }
}

// ============================================================================
// EVENT LISTENERS INITIALIZATION
// ============================================================================
function initEventListeners() {
  // Sidebar Navigation Item Listeners
  DOM.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      if (!viewId) return; // e.g. the Home button, which has its own listener
      showView(viewId);
    });
  });

  // Home Return Button (Studio Sidebar)
  const btnHome = document.getElementById('btn-nav-home');
  if (btnHome) btnHome.addEventListener('click', () => showView('view-landing'));

  // Launch Studio Buttons (Landing Header, Hero, Modals)
  ['btn-launch-studio-header', 'btn-launch-studio-hero', 'btn-paper-open-studio'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => showView('view-studio'));
  });

  // Brand Logo Buttons (Return to Landing)
  ['btn-landing-brand-logo', 'btn-studio-brand-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => showView('view-landing'));
  });

  // Landing Page Modals
  const bindModal = (btnId, modalId) => {
    const b = document.getElementById(btnId);
    const m = document.getElementById(modalId);
    if (b && m) {
      b.addEventListener('click', () => { m.style.display = 'flex'; });
    }
  };
  bindModal('btn-how-it-works', 'modal-how-it-works');
  bindModal('btn-pipeline', 'modal-pipeline');
  bindModal('btn-paper', 'modal-paper');
  bindModal('btn-read-paper', 'modal-paper');

  document.querySelectorAll('.btn-close-generic-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-backdrop');
      if (modal) modal.style.display = 'none';
    });
  });

  // Close modals on clicking backdrop
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });

  // Camera Buttons
  DOM.btnToggleCam.addEventListener('click', toggleCamera);
  DOM.btnStartCamOverlay.addEventListener('click', startCamera);
  DOM.btnTogglePause.addEventListener('click', togglePauseStream);
  DOM.btnToggleLandmarks.addEventListener('click', toggleLandmarksOverlay);

  // Buffer Controls
  DOM.btnUndoSign.addEventListener('click', undoLatestSign);
  DOM.btnClearBuffer.addEventListener('click', clearBuffer);
  DOM.btnAddSign.addEventListener('click', () => {
    DOM.modalAddSign.style.display = "flex";
  });
  DOM.btnCloseModal.addEventListener('click', () => {
    DOM.modalAddSign.style.display = "none";
  });

  // Hero Sentence Buttons
  DOM.btnSpeakSentence.addEventListener('click', () => {
    speakText(DOM.aiSentenceDisplay.innerText, 'en-IN');
  });
  DOM.btnCopySentence.addEventListener('click', () => {
    navigator.clipboard.writeText(DOM.aiSentenceDisplay.innerText);
    alert("English sentence copied to clipboard.");
  });
  DOM.btnRegenerateSentence.addEventListener('click', () => {
    reconstructSentence(SignBufferState.versionId);
  });
  DOM.btnClearSentence.addEventListener('click', clearBuffer);

  // Section 15 & 19: User-Controlled Translation Buttons
  DOM.btnTriggerTranslate.addEventListener('click', triggerUserTranslation);
  DOM.selectTargetLang.addEventListener('change', (e) => {
    SignBufferState.activeLanguage = e.target.value;
    if (!DOM.translationDisplay.classList.contains("placeholder-text")) {
      triggerUserTranslation();
    }
  });
  DOM.btnSpeakTranslation.addEventListener('click', () => {
    const langCode = getLanguageCode(DOM.selectTargetLang.value);
    speakText(DOM.translationDisplay.innerText, langCode);
  });
  DOM.btnCopyTranslation.addEventListener('click', () => {
    navigator.clipboard.writeText(DOM.translationDisplay.innerText);
    alert("Translation copied to clipboard.");
  });

  // Theme Toggles (Landing & Studio)
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });
  if (DOM.themeToggleBtn) {
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);
  }
  if (DOM.btnToggleHighContrast) {
    DOM.btnToggleHighContrast.addEventListener('click', toggleTheme);
  }

  // Brightness Popover Slider
  const brightnessSlider = document.getElementById('brightness-slider');
  const brightnessValLbl = document.getElementById('brightness-val-lbl');
  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.documentElement.style.setProperty('--brightness-level', val);
      if (brightnessValLbl) brightnessValLbl.innerText = Math.round(val * 100) + '%';
    });
  }

  // Quick Help Sheet
  DOM.openHelpCardBtn.addEventListener('click', () => {
    window.open('/api/export-card', '_blank');
  });

  // Captions Overlay Toggle
  DOM.btnToggleCaptionsOverlay.addEventListener('click', () => {
    SignBufferState.captionsOverlayActive = !SignBufferState.captionsOverlayActive;
    DOM.captionsStatusLabel.innerText = SignBufferState.captionsOverlayActive ? "ON" : "OFF";
    DOM.liveCaptionsOverlay.style.display = SignBufferState.captionsOverlayActive ? "block" : "none";
  });

  // Conversation Mode Controls
  initSpeechRecognition();
  DOM.btnMicListen.addEventListener('click', () => {
    if (!speechRecognizer) {
      alert("Speech recognition not supported in this browser. Please type responses manually.");
      return;
    }
    try {
      speechRecognizer.start();
      DOM.btnMicListen.innerText = "Listening...";
      DOM.btnMicListen.classList.remove("btn-primary");
      DOM.btnMicListen.classList.add("btn-danger");
    } catch (e) {}
  });

  DOM.btnSpeakerSend.addEventListener('click', () => {
    const val = DOM.speakerManualInput.value.trim();
    if (val) {
      addSpeakerMessage(val);
      DOM.speakerManualInput.value = "";
    }
  });

  DOM.speakerManualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') DOM.btnSpeakerSend.click();
  });

  DOM.btnClearConversation.addEventListener('click', () => {
    DOM.signerDialogueThread.innerHTML = '<div class="thread-empty">Signs reconstructed in Live Studio appear here automatically.</div>';
    DOM.speakerDialogueThread.innerHTML = '<div class="thread-empty">Tap "Start Listening" to transcribe spoken responses for the signer.</div>';
  });

  // Multi-Lingual Translation Workbench
  DOM.btnWorkbenchTranslate.addEventListener('click', async () => {
    const text = DOM.workbenchInput.value.trim();
    if (!text) return;

    const translateSingle = async (lang, elementId) => {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text, language: lang, version_id: 1 })
        });
        const data = await res.json();
        const el = document.getElementById(elementId);
        if (el) el.innerText = data.text;
      } catch (e) {}
    };

    await Promise.all([
      translateSingle("Marathi", "wb-marathi-output"),
      translateSingle("Hindi", "wb-hindi-output"),
      translateSingle("Gujarati", "wb-gujarati-output"),
      translateSingle("Tamil", "wb-tamil-output"),
      translateSingle("Telugu", "wb-telugu-output")
    ]);
  });

  // History Controls
  DOM.btnClearHistory.addEventListener('click', () => {
    DOM.historyTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No history recorded.</td></tr>';
  });

  DOM.btnExportHistoryCsv.addEventListener('click', () => {
    const rows = Array.from(DOM.historyTableBody.querySelectorAll('tr'));
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(r => {
      return Array.from(r.querySelectorAll('td')).map(td => `"${td.innerText.replace(/"/g, '""')}"`).join(",");
    }).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `signova_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Settings
  DOM.selectActiveProfile.addEventListener('change', async (e) => {
    try {
      await fetch("/api/profiles/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: e.target.value })
      });
      loadProfiles();
    } catch (err) {}
  });

  DOM.btnSaveProfile.addEventListener('click', saveCurrentProfile);
  DOM.toggleVoiceShortcuts.addEventListener('change', (e) => {
    setVoiceShortcutsEnabled(e.target.checked);
  });
  DOM.btnAddWordpack.addEventListener('click', addWordPack);

  window.addEventListener('online', () => { DOM.offlineBanner.style.display = 'none'; });
  window.addEventListener('offline', () => { DOM.offlineBanner.style.display = 'block'; });
  if (!navigator.onLine) DOM.offlineBanner.style.display = 'block';
}

// Global Initialization
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('signbridge_theme') || 'dark';
  setTheme(savedTheme);

  initEventListeners();
  initBenchmarkMetrics();
  syncBufferDisplays();
  loadVocabulary();
  loadProfiles();
  loadWordPacks();
  loadPhrases();
  pollHealthTelemetry();
  initRecognitionSocket();

  setInterval(pollHealthTelemetry, 4000);

  // Initial Route & View Detection
  const initHash = (window.location.hash || '').toLowerCase();
  const initPath = (window.location.pathname || '').toLowerCase();
  if (initPath.includes('studio') || initHash === '#studio') {
    showView('view-studio');
  } else if (initHash && initHash !== '#landing') {
    const target = 'view-' + initHash.replace('#', '');
    if (document.getElementById(target)) {
      showView(target);
    } else {
      showView('view-landing');
    }
  } else {
    showView('view-landing');
  }

  logPipelineEvent("boot", `Signova assistive platform ready on ${window.location.host}`);
});
