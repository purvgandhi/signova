# Signova / SignBridge Studio — Claude Developer Guide

Welcome Claude! This document is your comprehensive operational guide for understanding, enhancing, and deploying the **Signova / SignBridge Studio** project.

---

## 1. What Signova Does

Signova is an assistive technology platform that bridges the communication barrier between Deaf/non-verbal signers and hearing non-signers in India.

- **Input**: Standard optical webcam feed capturing continuous Indian Sign Language gestures. No specialized gloves, depth sensors, or external hardware required.
- **Processing**: Extracts 21 3D landmarks per hand at 30 FPS, classifies gestures via an LSTM sequence model, and gates emissions through a temporal state machine.
- **Language Bridge**: Turns gesture tokens into grammatically complete, natural English sentences using a local Small Language Model (SLM) cache with cloud SLM fallback.
- **Multilingual Output**: Translates sentences immediately into 5 regional Indian languages (**Marathi**, **Hindi**, **Gujarati**, **Tamil**, and **Telugu**) and voices them using Web Speech TTS.

---

## 2. How the Frontend Works

The frontend is a lightweight, zero-framework web application located in `frontend/`:
- **Single Page Application**: Both the Landing Page (`/` or `#landing`) and the Live Studio (`/studio` or `#studio`) exist within `frontend/index.html`.
- **Viewport-Locked Layout**: On desktop screens ($\ge 1024\text{px}$), the UI locks to $100\text{dvh}$ with zero page-level scrollbars. Sub-panels (e.g. detected signs chips container) use internal scrolling.
- **Shared Design System**: Defined in `frontend/style.css`.
  - **Tokens**: Semantic CSS variables (`--primary: #2563EB`, `--card-bg`, `--heading`, `--text`, `--font-heading: 'Plus Jakarta Sans'`, `--font-body: 'DM Sans'`, etc.).
  - **Themes**: Two distinct themes (Light and Dark). No "High Contrast" theme.
  - **Background**: Low-poly triangulated gradient texture (`poly-bg.svg`) with 15% dark overlay and 3.5% SVG grain.
- **Client Controller (`frontend/app.js`)**: Initializes MediaPipe Hands in the browser via CDN/WASM, renders landmark overlays onto `<canvas id="landmark-canvas">`, maintains WebSocket connectivity, and updates HUD telemetry widgets.

---

## 3. How the Backend Works

The backend is built with **FastAPI** (`backend/app.py`) running on **Python 3.11** and **Uvicorn**:
- **Static File Serving**: Serves the `frontend/` directory directly at `/` and `/studio`.
- **WebSocket Streaming (`/ws/recognition`)**: High-throughput duplex channel receiving serialized 126-float landmark packets from the client and broadcasting real-time inference states, confidence scores, stability progress, and accepted sign events.
- **REST Endpoints**:
  - `POST /api/sentence`: Reconstructs sign sequences into natural English sentences with monotonic versioning.
  - `POST /api/translate`: Translates reconstructed sentences to any of the 5 supported Indic languages.
  - `GET /api/wordpacks` & `POST /api/wordpacks`: CRUD operations for custom emergency gesture expressions.
  - `GET /api/profiles`: Loads calibration profiles (Standard, Expert, Tremor, Left Dominant).
  - `GET /api/health`: Provides real-time subsystem diagnostics.

---

## 4. How the ML Pipeline Works

1. **Extraction**: MediaPipe tracks up to 2 hands in each 30 FPS video frame.
2. **Feature Vector**: 21 landmarks $\times$ 3 coordinates $(x, y, z) \times 2\text{ hands} = \mathbf{126\text{ normalized floats}}$.
3. **Temporal Rolling Window**: Kept in a 30-frame FIFO queue (input tensor shape: `(1, 30, 126)`).
4. **Classification**: Evaluated by a Keras LSTM model (`lstm_gesture_model.keras`) trained on 20 emergency & everyday gesture categories:
   > `hello`, `yes`, `no`, `please`, `thankyou`, `water`, `food`, `help`, `stop`, `good`, `bad`, `more`, `where`, `what`, `name`, `home`, `school`, `doctor`, `pain`, `happy`.
5. **State Machine (`ml/recognition/state_machine.py`)**:
   - `IDLE` $\rightarrow$ `DETECTING` (confidence $\ge 0.50$) $\rightarrow$ `STABLE` (same class for 8 consecutive frames with confidence $\ge 0.70$) $\rightarrow$ `ACCEPTED` (token emitted) $\rightarrow$ `COOLDOWN` (8-frame lockout to prevent jitter).

---

## 5. How Live Studio Works

The Live Studio (`/studio`) is a viewport-locked 3-column workspace:
- **Column 1 — Vision Stream**:
  - Mirrored video feed (`#webcam`) with overlay `<canvas id="landmark-canvas">`.
  - Placeholder overlay (`#camera-idle-placeholder`) when camera is off.
  - Solid camera controls bar (Start/Stop, Landmarks Toggle, Pause).
  - Telemetry progress bars: Session Buffer ($n/20$) and Hold Stability ($0-100\%$).
- **Column 2 — Linguistic Synthesis**:
  - **AI Reconstructed Sentence Card**: Displays the current synthesized sentence with instant TTS voicing (`#btn-speak-sentence`).
  - **Translation Card**: Dropdown to select language + Devanagari/Indic translation container + audio voicing (`#btn-speak-translation`).
  - **Detected Signs Stream Card**: Scrollable chips strip (`#detected-signs-chips`) representing active tokens, plus Undo (`#btn-undo-sign`) and Clear Buffer (`#btn-clear-buffer`).
- **Column 3 — Telemetry & Diagnostics**:
  - **Confidence Telemetry**: Circular SVG gauge (`#telemetry-gauge`) + top gesture readout.
  - **Rolling Sparkline**: 30-frame live SVG polyline (`#telemetry-sparkline-svg`) with a 70% threshold reference line.
  - **Recognition Guide**: One-tap quick buttons to simulate emergency gestures into buffer without webcam.
  - **Diagnostics Accordion**: Real-time packet sent/received counters and event log.

---

## 6. How Frontend Communicates with Backend

```
+----------------------------------------------------------------------------+
| CLIENT (Browser)                                         SERVER (FastAPI)  |
|                                                                            |
|  [30 FPS Video Frame]                                                      |
|           │                                                                |
|     MediaPipe Hands                                                        |
|           │                                                                |
|  126-Float Vector ─── (WebSocket: /ws/recognition) ────> FIFO Buffer (30)  |
|                                                                 │          |
|                                                            LSTM Inference  |
|                                                                 │          |
|  HUD Update <──────── (WebSocket Packet: state, conf) ── State Machine     |
|                                                                            |
|  [Accepted Token Event]                                                    |
|           │                                                                |
|  Trigger Sentence ─── (REST POST: /api/sentence) ───────────> Sentence Eng |
|                                                                 │          |
|  Sentence Display <── (JSON: sentence, version_id) ─────────────┘          |
|           │                                                                |
|  Trigger Translate ── (REST POST: /api/translate) ──────────> Trans Eng    |
|                                                                 │          |
|  Translate Display <─ (JSON: translated, lang) ─────────────────┘          |
+----------------------------------------------------------------------------+
```

---

## 7. How to Run the Project

### Requirements
- **Python**: 3.10 or 3.11 (Do **not** use Python 3.12 due to TensorFlow 2.13 protobuf conflicts).
- **Node.js**: Optional (only if running frontend dev server or linters).

### Step 1: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(Optionally provide a Gemini API key if you want cloud SLM fallback for un-templated sign combinations).*

### Step 3: Start the Backend Server
```bash
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

### Step 4: Open in Browser
- Landing Page: `http://127.0.0.1:8000/`
- Live Studio: `http://127.0.0.1:8000/studio`

### Running the Test Suite
```bash
python tests/run_all_tests.py
python tests/test_master_prompt_e2e.py
```

### Docker Deployment
```bash
docker build -t signova-studio .
docker run -p 8000:8000 --env-file .env signova-studio
```

---

## 8. Which Files Claude Should Focus on for Redesign / Animations

If your task is to improve the UI, add animations, enhance transitions, or polish the design system:

1. **`frontend/style.css`**:
   - Add CSS keyframe animations, glass/mesh visual refinements, button micro-interactions.
   - Adjust typography sizes, line-heights, and spacing tokens.
   - Refine Dark and Light theme color palettes.
   - Polish responsive layout breakpoints.
2. **`frontend/index.html`**:
   - Refine semantic HTML, card containers, badge layouts, and modal dialogues.
   - Add decorative SVG accents or icon sets (Lucide line-style recommended).
   - Enhance the Landing Page hero section.
3. **`frontend/app.js` (UI Presentation layer only)**:
   - Enhance gauge animations and sparkline transitions.
   - Add toast notifications or UI feedback sounds.
   - Smooth out modal enter/exit animations.

---

## 9. Which Files Claude Must Leave Untouched

To ensure zero regressions to the working ML and camera pipeline, **NEVER modify or delete**:

- **Contract HTML Element IDs**:
  Do NOT change or remove: `#webcam`, `#landmark-canvas`, `#camera-idle-placeholder`, `#ai-sentence-display`, `#translation-display`, `#select-target-lang`, `#detected-signs-chips`, `#raw-model-sequence`, `#telemetry-confidence-pct`, `#telemetry-top-gesture-name`, `#hud-buffer-counter`, `#hud-buffer-progress-bar`, `#stability-progress`.
- **`ml/recognition/recognizer.py` & `ml/recognition/state_machine.py`**:
  Contains the 126-coordinate parsing logic and state machine thresholds.
- **WebSocket Protocol in `frontend/app.js` & `backend/app.py`**:
  The JSON packet fields (`packet_id`, `landmarks`, `stability`, `accepted_sign`, `confidence`) must stay strictly aligned.
- **Monotonic Version Handling**:
  The `version_id` mechanism in `sentence_engine.py` and `frontend/app.js` prevents out-of-order race conditions and must be preserved.
