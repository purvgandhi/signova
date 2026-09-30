# Signova — Deployment Guide

Signova is one FastAPI process that serves the frontend (`frontend/`), the REST API and the
`/ws/recognition` WebSocket. There is no separate frontend build step: the site is plain
HTML, CSS and JavaScript with no npm dependencies.

## 1. Environment variables

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `GEMINI_API_KEY` | No | unset | `backend/sentence_engine.py`, `backend/translation_engine.py`, `backend/gemini_sentence.py` (Live Studio "Generated Sentence" via `POST /api/gemini-sentence`) | Enables the optional Gemini fallback for sign combinations and translations that are not in the local dictionary. Without it Signova runs fully offline from `backend/data/local_sentences.json`. **Secret: set it in the host's dashboard, never in a file you commit.** |
| `GEMINI_MODEL` | No | `gemini-3.5-flash` | same as above, `/api/health` | Model name for the fallback. |
| `PORT` | Set by host | `8000` | `Dockerfile` CMD, `render.yaml` startCommand | Most hosts inject this automatically. |
| `PYTHON_VERSION` | Render only | `3.11.8` | `render.yaml` | Keep on 3.11; TensorFlow 2.13 does not support 3.12. |

`HOST` and `ENVIRONMENT` in `.env.example` are not read by the code.

For local runs, copy `.env.example` to `.env` and fill in values. `.env` is ignored by git and
excluded from Docker images by `.dockerignore`.

## 2. Files the server needs at runtime

| Path | Why |
|---|---|
| `models/lstm_gesture_model.keras` | Trained LSTM (2.4 MB). Path set in `config/recognition.yaml`. |
| `models/lstm_gesture_labels.pkl` | The 20 gesture labels. |
| `frontend/assets/videos/intro.mp4` + `intro-poster.jpg` | The full-screen opening video (4.7 MB) and its first-frame poster. |

`.gitignore` ignores `*.keras`, `*.pkl` and `*.mp4` in general, with explicit exceptions for
`models/` and `frontend/assets/videos/`, so these files are committed and shipped.

### Opening video

`frontend/assets/videos/intro.mp4` is the website's opening: it plays full-screen, muted and
without controls on every fresh load of the home page, before any home-page content is visible. When it
ends, its last frame is frozen onto a canvas,
crushed, cracked and shattered into glass shards, and the landing page emerges behind them. The
video element is then removed from the page, so nothing keeps playing in the background.
**Skip intro** (or Esc) removes the video and shows the home page immediately.

- The video is only requested when the intro will actually play; direct `/studio` links and
  `prefers-reduced-motion` never download it. Moving between Home and Studio inside the app
  does not replay it.
- If the video cannot autoplay within 2.5 s, errors, or the visitor has Data Saver on, the same
  two-hand collision is drawn in Canvas instead, followed by the same glass burst.
- On portrait phones the video is letterboxed (`object-fit: contain`) so both hands stay visible.
- To replace it, keep the file name, 720p H.264, and ideally under ~10 MB. Regenerate
  `intro-poster.jpg` from an early frame.

## 3. Hosting options

### Render (configured in `render.yaml`)

1. Push the repository to GitHub and create a **Blueprint** in Render from `render.yaml`.
2. In the service's **Environment** tab, set `GEMINI_API_KEY` (optional).
3. Render builds with `pip install -r requirements.txt`, starts Uvicorn on `$PORT`, and
   uses `/api/health` as its health check. WebSockets work on Render web services.

**Free plan caveat.** `render.yaml` stays on the `standard` plan. TensorFlow, MediaPipe and
OpenCV together need roughly 1 GB of RAM once the LSTM is loaded, and Render's free plan has
512 MB, so a free instance is likely to be killed for memory when the first recognition
request loads the model. Free instances also sleep after inactivity (the first visit then
takes about a minute) and have no persistent disk, so word packs and profiles written to
`backend/data/` are lost on restart. To try it anyway, change `plan: standard` to
`plan: free` and watch the service logs for out-of-memory restarts.

### Docker (any container host)

```bash
docker build -t signova-studio .
docker run -p 8000:8000 --env-file .env signova-studio
```

The image listens on `$PORT` (default 8000), so it runs unchanged on Railway, Fly.io,
Google Cloud Run (enable session affinity for WebSockets) or a VM.

## 4. Pre-deployment checklist

Run these locally from the project root before deploying:

```bash
python tests/run_all_tests.py
python tests/test_master_prompt_e2e.py
python tests/run_e2e_audit.py
```

```bash
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Then check:

| Check | How |
|---|---|
| Backend starts | Log shows `Uvicorn running`; no import errors |
| Health endpoint | `GET /api/health` returns `"status": "healthy"` |
| Model loads | `GET /api/vocabulary` returns 20 labels |
| WebSocket | Open `/studio`; the header shows **Socket connected** |
| Static assets | `/`, `/studio`, `/style.css`, `/landing.css`, `/landing.js`, `/app.js` return 200 |
| Video | `/assets/videos/intro.mp4` returns 200; `/?intro=1` plays it and then shatters into the landing page |
| CORS | `backend/app.py` allows all origins; tighten `allow_origins` if the API is ever called from another domain |
| Secrets | `git grep -n "AIza"` finds nothing; `.env` is not committed |

## 5. Frontend notes

- **Opening** (video, then glass burst) plays on every fresh load of `/`. Use
  `?introMode=canvas` to preview the Canvas fallback.
- All landing animations pause when their section is off screen, when the tab is hidden and
  whenever the Live Studio is open, so they never compete with recognition.
