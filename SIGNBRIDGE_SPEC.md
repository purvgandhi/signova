# SIGNBRIDGE SPECIFICATION (SIGNBRIDGE_SPEC.md)

## System Overview
SignBridge is a low-latency, assistive AI live vision studio bridging Indian/American Sign Language gesture recognition, Small Language Model (SLM / Gemini) natural English sentence reconstruction, and user-controlled local Indian language translation (Hindi & Marathi).

---

## Core Rules & Architecture Principles
1. **Local-First Execution**: The application runs strictly on `http://127.0.0.1:8000`. No remote hosting or public cloud deployments.
2. **Deterministic-First Content**:
   - Zero Gemini calls for deterministic or critical emergency phrases.
   - Exact gesture sequence matches are resolved locally using `local_sentences.json` and custom user Word Packs.
   - Offline fallback always provides 100% functional sentence reconstruction from recognized tokens.
3. **No Fabricated Telemetry**:
   - Real FPS calculated dynamically from frame timing.
   - Real backend connectivity verified via `/api/health`.
   - Stability counter strictly capped at denominator (e.g. `min(count, 8)/8 frames`) and reset to 0 upon accepted sign.
   - Telemetry status badge strictly bound to `TelemetryStatus` (`Idle`, `Detecting`, `Stable`, `Low Confidence`, `Stale`), never token or gesture names.
4. **Single Source of Truth for Session Buffer**:
   - Exactly one state store (`SignBufferState`) governs recognized tokens.
   - The HUD counter (`BUFFER: N/MAX`), Detected Signs chip row (`N tokens`), and Raw Model Sequence strip read synchronously from this store.
5. **Atomic Versioned Sentence Reconstruction**:
   - Every modification (sign append, manual chip delete, manual insert, undo, clear) generates an incremented monotonic `version_id`.
   - Any asynchronous response where `response.version_id < current_version_id` is discarded to prevent stale overwrite.

---

## Phase 10: Visual Design Tokens & Design System

### Color Palette (Dark Theme — Default)
- **Canvas Background**: Midnight Slate `#0A0F1D` (RGB: `10, 15, 29`)
- **Navbar / Chrome**: Deep Slate `#0F172A` (RGB: `15, 23, 42`)
- **Card Background (Elevated)**: Midnight Blue-Slate `#11182B` (RGB: `17, 24, 43`)
- **Sub-Card / Wells**: Rich Navy `#172036` (RGB: `23, 32, 54`)
- **Borders & Dividers**: Slate-800 `#212D47` (RGB: `33, 45, 71`)
- **Primary Accent**: Electric Blue `#3B82F6` (RGB: `59, 130, 246`)
- **Primary Active / Dark Accent**: Royal Blue `#1D4ED8` (RGB: `29, 78, 216`)
- **Primary Text**: Crisp Off-White `#F8FAFC` (RGB: `248, 250, 252`)
- **Muted Text**: Slate-400 `#94A3B8` (RGB: `148, 163, 184`)
- **Subtle Text**: Slate-500 `#64748B` (RGB: `100, 116, 139`)
- **Status Success (Stable)**: Emerald-500 `#10B981` (RGB: `16, 185, 129`)
- **Status Warning (Low Conf / Stale)**: Amber-500 `#F59E0B` (RGB: `245, 158, 11`)
- **Status Danger (Error / Clear)**: Rose-500 `#EF4444` (RGB: `239, 68, 68`)

### Light Mode Variant
- **Canvas Background**: `#F8FAFC`
- **Navbar / Chrome**: `#FFFFFF`
- **Card Background**: `#FFFFFF`
- **Sub-Card Background**: `#F1F5F9`
- **Borders**: `#E2E8F0`
- **Primary Text**: `#0F172A`
- **Muted Text**: `#64748B`

### High-Contrast / Colorblind-Safe Variant (WCAG AA Compliance)
- **Canvas Background**: `#000000`
- **Navbar / Cards**: `#0A0A0A`
- **Borders**: `#FFFFFF` (2px solid)
- **Primary Accent**: `#FFFF00` (High-contrast yellow, >10:1 ratio against black)
- **Secondary Accent**: `#00FFFF` (High-contrast cyan)
- **Primary Text**: `#FFFFFF` (Ratio 21:1 against black)
- **Danger / Clear**: `#FF5555`
- **Success / Stable**: `#55FF55`

### Spacing & Corner Radii
- **Card Border Radius**: `20px` (Outer container cards), `14px` (Inner sub-cards)
- **Action Buttons / Pills**: `21px` (Pill style, height 42px)
- **Controls & Secondary Buttons**: `18px` (height 36px)
- **Token Chips**: `22px` (height 44px, rounded pill)
- **HUD Badges**: `11px` radius

---

## Phase 11: Calibration Data Model
- Calibration profiles allow personalization for gesture hold time, minimum confidence threshold, handedness, and resting position.
- Profile Schema:
  ```json
  {
    "id": "profile_me",
    "name": "Me",
    "hold_threshold_frames": 8,
    "min_confidence": 0.70,
    "hand_preference": "both",
    "handedness_swap": true,
    "auto_speak_sentence": false,
    "voice_shortcuts_enabled": false
  }
  ```

---

## API Specifications
- `GET /api/health` -> System health telemetry (backend status, camera fps, model inference ready, Gemini status).
- `POST /api/sentence` -> `{ "signs": [...], "version_id": int }` -> `{ "text": str, "source": str, "version_id": int, "status": str }`
- `POST /api/translate` -> `{ "text": str, "language": str, "version_id": int }` -> `{ "text": str, "source": str, "error_reason": str | null }`
- `GET /api/wordpacks` -> List custom user word packs.
- `POST /api/wordpacks` -> Add or update custom phrase template.
- `DELETE /api/wordpacks/{key}` -> Remove template.
- `GET /api/profiles` / `POST /api/profiles` -> Calibration profiles.
- `GET /api/export-card` -> Downloadable/printable emergency card.
