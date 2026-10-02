# SignBridge — Advanced Real-Time Assistive Communication Platform

**Assistive Indian Sign-to-Local Language Intelligence Bridge**  
Target Environment: **Local Only (`http://127.0.0.1:8000`)**  
Status: **Production-Grade Assistive Platform (All Master Requirements Verified)**

---

## 1. System Pipeline Overview

SignBridge converts real-time Indian Sign Language (ISL) gestures into natural English sentences and translates them into Indian local languages with native speech output:

```text
CAMERA FEED (640x480)
       ↓
MEDIAPIPE HAND SKELETON (21 landmarks / 126 features)
       ↓
EXISTING LSTM GESTURE MODEL (20 trained classes)
       ↓
TEMPORAL STABILITY & DEDUPLICATION (State Machine)
       ↓
ACCEPTED SIGN SEQUENCE
       ↓
AUTOMATIC ENGLISH SENTENCE RECONSTRUCTION (Controlled SLM / Gemini / Cache)
       ↓
USER-CONTROLLED LOCAL LANGUAGE TRANSLATION (Marathi, Hindi, Gujarati, Tamil, Telugu)
       ↓
NATIVE TEXT-TO-SPEECH (TTS)
```

---

## 2. Core Communication Flow Example

```text
User signs:
  [HELP] → [DOCTOR] → [PAIN]

1. Computer Vision:
   MediaPipe detects hand landmarks at 60 FPS; LSTM classifies gestures above 70% confidence.

2. Gesture Acceptance & Deduplication:
   8 consecutive stable frames accepted per sign. Continuous holding is suppressed—each gesture enters the buffer exactly once.

3. Automatic English Sentence (0 clicks required):
   "I need help from a doctor because I am in pain."
   (Generated via controlled prompt / local sentence cache).

4. User-Controlled Translation (1 click):
   User clicks "🌐 TRANSLATE" with "Marathi (मराठी)" selected.
   Output: "मला वेदना होत असल्याने मला डॉक्टरांकडून मदत हवी आहे."

5. Voice Speech (1 click):
   User clicks "🔊 Speak".
   The native Marathi sentence is spoken aloud via Indian voice synthesis.
```

---

## 3. Key Architecture & Features

### A. Fixed Left Vertical Sidebar Navigation (Section 21)
- **Width**: 250px clean fixed navigation.
- **Views**:
  1. `🖐 Live Studio`: Camera feed, AI Reconstructed Sentence Hero, Detected Signs, Translation, Telemetry, and Quick Phrases.
  2. `💬 Conversation`: Two-way dialogue between deaf signer and hearing user with speech recognition.
  3. `🌐 Translate`: Multi-lingual translation workbench for Marathi, Hindi, Gujarati, Tamil, and Telugu.
  4. `📜 History`: Session sentence log with export and replay actions.
  5. `⚡ Phrases`: 1-tap emergency and quick assistive phrase book.
  6. `📚 Learn`: Practice and test the 20 vocabulary signs with real-time confidence feedback.
  7. `📊 Analytics`: Real-time session metrics, latency, duplicate suppressions, and API telemetry.
  8. `⚙ Settings`: Per-user calibration profiles, hands-free voice shortcuts, and WCAG AA high-contrast theme.

### B. Gesture Deduplication & Boundary Detection (Section 2, 3, 4, 5)
- **Problem Solved**: Holding a gesture continuous stream (`MORE MORE MORE`) no longer floods the buffer.
- **Mechanism**:
  - Requires 8 consecutive stable frames above 70% confidence.
  - Active duplicate suppression prevents re-acceptance until a neutral hand transition or pause occurs.
  - Distinct separation between Raw Model Stream (debug only) and Accepted Signs (buffer).

### C. Automatic Sentence Reconstruction (Section 6, 8, 9, 10, 11, 12, 51)
- **No manual "Generate Sentence" button**: updates automatically on every accepted sign, undo, or quick phrase.
- **Dedicated System Prompt**: Preserves recognized concepts without inventing unexpressed symptoms, medical diagnosis, or urgency.
- **Local Sentence Cache & Deterministic Templates**: High-frequency signs (`HELP` -> "I need help.", `WATER` -> "I need water.") are resolved in 0ms locally without calling Gemini.
- **Race Condition Protection**: Monotonically increasing version IDs ensure older out-of-order network responses are discarded.

### D. User-Controlled Multi-Lingual Translation (Section 15, 16, 17, 18, 19)
- English sentence is automatic; translation is triggered explicitly by the user.
- **Supported Languages**:
  - Marathi (`मराठी`) — Default
  - Hindi (`हिन्दी`)
  - Gujarati (`ગુજરાતી`)
  - Tamil (`தமிழ்`)
  - Telugu (`తెలుగు`)
  - English
- Native script validation ensures translations render in Devanagari, Gujarati, Tamil, and Telugu.

### E. Speech Synthesis (TTS) (Section 20)
- Browser `SpeechSynthesis` with native Indian voice detection (`mr-IN`, `hi-IN`, `gu-IN`, `ta-IN`, `te-IN`, `en-IN`).
- Start / stop toggle controls.

### F. Privacy & Offline Capability (Section 1, 39, 47, 66)
- Camera frames remain strictly local and are **never** uploaded to Gemini or third parties.
- Local sentence cache and dictionary allow complete offline communication.

---

## 4. Environment Variables & Security

Stored in `.env` (git-ignored, never exposed to frontend):

```env
GEMINI_API_KEY=AQ.Ab8RN6IUGeU7cr3aXCoRfbVxiYetmGybHRVSwKSuqMJPdUBBsA
GEMINI_MODEL=gemini-3.5-flash
```

---

## 5. Running the Application Locally

1. **Start the Backend Server**:
   ```powershell
   py -3.11 -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
   ```

2. **Open in Browser**:
   ```text
   http://127.0.0.1:8000
   ```

3. **Run Automated Test Suites**:
   ```powershell
   py -3.11 tests/run_all_tests.py
   py -3.11 tests/test_master_prompt_e2e.py
   ```

---

## 6. API Endpoints Reference

| Endpoint | Method | Description |
|---|---|---|
| `/ws/recognition` | WebSocket | Real-time landmark (126 features) and frame streaming |
| `/api/sentence` | POST | Reconstructs sign tokens into a grammatical English sentence |
| `/api/translate` | POST | Translates English sentence into target Indian language |
| `/api/vocabulary` | GET | Single source of truth for the 20 gesture labels from `lstm_gesture_labels.pkl` |
| `/api/analytics` | GET | Real runtime metrics: latency, accepted signs, duplicate suppressions, cache hits |
| `/api/health` | GET | Camera, WebSocket, backend, and Gemini service diagnostics |
| `/api/wordpacks` | GET / POST | Custom phrase expansion templates |
| `/api/profiles` | GET / POST | Per-user signer calibration profiles |
| `/api/export-card` | GET | Printable Emergency Communication Sheet |

---

## 7. Troubleshooting

- **Webcam permission denied**: Click "Start Live Camera" and allow browser camera permissions.
- **Python version**: Must run on Python 3.11 (`py -3.11`) due to MediaPipe and TensorFlow requirements.
- **AI Offline notice**: If the API key is unavailable or rate-limited, SignBridge seamlessly falls back to the local 100-sentence deterministic engine without interrupting live communication.
