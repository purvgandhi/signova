# Signova

**When hands speak, language follows.** Signova turns Indian Sign Language gestures captured by an
ordinary webcam into natural English sentences and five regional Indian languages (Marathi, Hindi,
Gujarati, Tamil, Telugu), with speech output, in real time.

```
Webcam → MediaPipe (21 landmarks × 2 hands = 126 floats) → WebSocket /ws/recognition
       → 30-frame LSTM + state machine → gloss tokens → /api/sentence → /api/translate → TTS
```

- **Frontend** (`frontend/`): plain HTML, CSS and JavaScript, no build step. Landing page with a
  video opening, and the Live Studio at `/studio`.
- **Backend** (`backend/`): FastAPI + Uvicorn. REST APIs and the `/ws/recognition` WebSocket.
- **ML** (`ml/`): recognition (`ml/recognition/`) and training scripts (`ml/training/`).
- **Model** (`models/`): the trained LSTM (`lstm_gesture_model.keras`, 2.4 MB) and its 20 labels.

## Quick start

Requires **Python 3.10 or 3.11** (TensorFlow 2.13 does not support 3.12).

```bash
pip install -r requirements.txt
cp .env.example .env          # then edit .env (see below)
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/> (landing page) or <http://127.0.0.1:8000/studio> (Live Studio).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Enables Gemini for the Live Studio "Generated Sentence" line and as a fallback in the sentence/translation engines. Without it Signova runs fully offline from `backend/data/local_sentences.json`. Keep it in `.env` or your host's secret settings; it is only read on the server. |
| `GEMINI_MODEL` | Optional | Gemini model name (default `gemini-3.5-flash`). |
| `PORT` | Hosting | Port for Docker / hosting platforms (default 8000). |

`.env` is git-ignored. Never commit real keys.

## Tests

```bash
python tests/run_all_tests.py          # 7 unit/contract suites
python tests/test_master_prompt_e2e.py # 9-step end-to-end pipeline
python tests/run_e2e_audit.py          # feature audit (writes reports/feature_audit.md)
```

## Model and data files

- The trained model and labels in `models/` are small and are included in the repository.
- Raw training data (`gesture_data/`) and recordings are **not** included. To retrain, collect
  landmark sequences with `ml/training/collect_data.py`, then run `ml/training/train_lstm.py`
  (LSTM) or `ml/training/train_model.py` (Random Forest baseline), and place the resulting
  `lstm_gesture_model.keras` and `lstm_gesture_labels.pkl` in `models/`. Paths are set in
  `config/recognition.yaml`.

## Deployment

GitHub only stores the code; it does not run the backend. Signova needs a host that runs a
long-lived Python process with WebSockets and roughly 1–2 GB of RAM (TensorFlow + MediaPipe +
OpenCV). See **[DEPLOYMENT.md](DEPLOYMENT.md)** for Docker, Render and hosting notes.

```bash
docker build -t signova .
docker run -p 8000:8000 --env-file .env signova
```

## More documentation

- [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md): system architecture and data contracts
- [CLAUDE_README.md](CLAUDE_README.md): developer guide (frontend, backend, ML, protected contracts)
- [DEPLOYMENT.md](DEPLOYMENT.md): environment variables, hosting and pre-deployment checklist
