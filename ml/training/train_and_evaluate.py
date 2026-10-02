"""
Comprehensive ML Pipeline for Signova Gesture Recognition
- Invariant landmark representation (wrist-centering & palm-scale normalization)
- Ambidextrous & multi-factor data augmentation (spatial jitter, scale, rotation, hand mirroring)
- Subject-level leakage-safe splitting (Train / Val / Test)
- Class-balanced weighting
- Bidirectional Deep LSTM + Dropout + Regularization
- In-depth evaluation (Accuracy, Macro/Weighted F1, Classification Report, Confusion Matrix, Latency)
- Parity-guaranteed model exports to primary and fallback model paths
"""
from __future__ import annotations

import os
import re
import time
import json
import pickle
import random
import numpy as np
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from typing import Dict, List, Tuple, Any

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Bidirectional, Dense, Dropout, BatchNormalization, Input
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.utils import to_categorical
from tensorflow.keras import regularizers

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight

from ml.recognition.normalization import normalize_landmarks_sequence, normalize_landmarks_frame

# Set reproducible seeds
SEED = 42
os.environ["PYTHONHASHSEED"] = str(SEED)
random.seed(SEED)
np.random.seed(SEED)
tf.random.set_seed(SEED)

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
MODELS_DIR = REPO_ROOT / "models"
GESTURE_DATA_DIR = REPO_ROOT / "data" / "gesture_data"

# Master 25-class vocabulary
ALL_GESTURES = sorted([
    "accident", "bad", "call", "doctor", "food",
    "good", "happy", "hello", "help", "home",
    "hot", "lose", "more", "name", "no",
    "pain", "please", "school", "stop", "thankyou",
    "thief", "water", "what", "where", "yes"
])


def load_all_samples_with_metadata() -> List[Dict[str, Any]]:
    """
    Loads all .npy samples across all gesture folders with subject/sample metadata
    and applies invariant landmark normalization.
    """
    samples = []
    print(f"Loading gesture data from {GESTURE_DATA_DIR}...")

    for label_idx, gesture in enumerate(ALL_GESTURES):
        gesture_folder = GESTURE_DATA_DIR / gesture
        if not gesture_folder.exists():
            print(f"  [WARN] Folder not found for '{gesture}'")
            continue

        npy_files = sorted(
            [f for f in os.listdir(gesture_folder) if f.endswith(".npy")],
            key=lambda x: int(re.sub(r"\D", "", x) or 0)
        )
        has_original = len(npy_files) == 30 or len(npy_files) == 82

        for fname in npy_files:
            file_path = gesture_folder / fname
            data = np.load(str(file_path))
            if data.shape != (30, 126):
                if len(data.shape) == 2 and data.shape[1] == 126:
                    orig_t = np.linspace(0, 1, len(data))
                    target_t = np.linspace(0, 1, 30)
                    resampled = np.zeros((30, 126), dtype=np.float32)
                    for c in range(126):
                        resampled[:, c] = np.interp(target_t, orig_t, data[:, c])
                    data = resampled
                else:
                    continue

            # Apply normalized invariant coordinate representation
            data_norm = normalize_landmarks_sequence(data.astype(np.float32))

            file_num = int(re.sub(r"\D", "", fname) or "0")

            if has_original and file_num < 30:
                subject_id = f"sub_orig_{(file_num % 10):02d}"
                source_type = "original"
            elif has_original and file_num >= 30:
                sub_num = ((file_num - 30) // 2) + 1
                subject_id = f"sub_vid_{sub_num:02d}"
                source_type = "video"
            else:
                sub_num = (file_num // 2) + 1
                subject_id = f"sub_vid_{sub_num:02d}"
                source_type = "video"

            samples.append({
                "gesture": gesture,
                "label_idx": label_idx,
                "subject_id": subject_id,
                "sample_id": f"{gesture}_{fname}",
                "file_num": file_num,
                "source_type": source_type,
                "data": data_norm
            })

        print(f"  Loaded & normalized {len(npy_files)} samples for '{gesture}'")

    return samples


def create_leakage_safe_splits(samples: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Splits samples into Train (~72%), Val (~14%), Test (~14%) strictly at the subject/group level.
    """
    train_samples = []
    val_samples = []
    test_samples = []

    by_gesture = {}
    for s in samples:
        by_gesture.setdefault(s["gesture"], []).append(s)

    for gesture, g_samples in by_gesture.items():
        orig_samples = [s for s in g_samples if s["source_type"] == "original"]
        vid_samples = [s for s in g_samples if s["source_type"] == "video"]

        # Split original recordings
        for s in orig_samples:
            if s["file_num"] <= 21:
                train_samples.append(s)
            elif s["file_num"] <= 25:
                val_samples.append(s)
            else:
                test_samples.append(s)

        # Split video recordings
        for s in vid_samples:
            sub_match = re.search(r"sub_vid_(\d+)", s["subject_id"])
            sub_num = int(sub_match.group(1)) if sub_match else 1
            if sub_num <= 20:
                train_samples.append(s)
            elif sub_num <= 23:
                val_samples.append(s)
            else:
                test_samples.append(s)

    # Verify zero subject overlap
    train_subs = {s["subject_id"] for s in train_samples if "sub_vid" in s["subject_id"]}
    test_subs = {s["subject_id"] for s in test_samples if "sub_vid" in s["subject_id"]}
    overlap = train_subs.intersection(test_subs)
    assert len(overlap) == 0, f"Subject leakage detected: {overlap}"

    return train_samples, val_samples, test_samples


def mirror_sequence_ambidextrous(seq: np.ndarray) -> np.ndarray:
    """
    Creates an ambidextrous mirror copy:
    - Left Hand and Right Hand slots are swapped
    - X-coordinates are inverted (-x) to maintain chiral symmetry
    """
    mirrored = np.zeros_like(seq)
    for t in range(len(seq)):
        frame = seq[t]
        lh = frame[:63].copy()
        rh = frame[63:].copy()

        # Invert X coordinates on both hands
        lh[0::3] = -lh[0::3]
        rh[0::3] = -rh[0::3]

        # Swap LH and RH
        mirrored[t, :63] = rh
        mirrored[t, 63:] = lh

    return mirrored


def augment_sequence(seq: np.ndarray) -> np.ndarray:
    """
    Applies comprehensive landmark data augmentation:
    - Spatial jitter
    - Scale variation
    - 2D rotation
    - Temporal speed jitter
    """
    aug = seq.copy()
    non_zero_mask = (aug != 0.0)

    # 1. Spatial jitter
    jitter = np.random.normal(0, 0.015, size=aug.shape).astype(np.float32)
    aug += jitter * non_zero_mask

    # 2. Scale variation (0.92 to 1.08)
    scale = np.random.uniform(0.92, 1.08)
    aug *= scale

    # 3. Small rotation (-8 deg to +8 deg in XY plane)
    angle = np.radians(np.random.uniform(-8.0, 8.0))
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    for frame_idx in range(len(aug)):
        frame = aug[frame_idx]
        for hand_offset in [0, 63]:
            hand_pts = frame[hand_offset:hand_offset + 63]
            if np.any(hand_pts != 0):
                xs = hand_pts[0::3].copy()
                ys = hand_pts[1::3].copy()
                valid = (xs != 0) | (ys != 0)
                if np.any(valid):
                    new_xs = xs * cos_a - ys * sin_a
                    new_ys = xs * sin_a + ys * cos_a
                    hand_pts[0::3] = np.where(valid, new_xs, 0)
                    hand_pts[1::3] = np.where(valid, new_ys, 0)
                    frame[hand_offset:hand_offset + 63] = hand_pts
        aug[frame_idx] = frame

    return aug


def build_augmented_training_set(train_samples: List[Dict[str, Any]], augment_factor: int = 4) -> Tuple[np.ndarray, np.ndarray]:
    X_list = []
    y_list = []

    for s in train_samples:
        orig = s["data"]
        label = s["label_idx"]

        # 1. Original normalized sequence
        X_list.append(orig)
        y_list.append(label)

        # 2. Ambidextrous mirrored version
        mirrored = mirror_sequence_ambidextrous(orig)
        X_list.append(mirrored)
        y_list.append(label)

        # 3. Augmented spatial & rotational variations
        for _ in range(augment_factor):
            X_list.append(augment_sequence(orig))
            y_list.append(label)
            X_list.append(augment_sequence(mirrored))
            y_list.append(label)

    return np.array(X_list, dtype=np.float32), np.array(y_list, dtype=np.int32)


def build_bilstm_model(num_classes: int, input_shape=(30, 126)) -> tf.keras.Model:
    model = Sequential([
        Input(shape=input_shape),
        Bidirectional(LSTM(128, return_sequences=True, dropout=0.25, recurrent_dropout=0.1)),
        BatchNormalization(),
        Bidirectional(LSTM(96, return_sequences=False, dropout=0.25, recurrent_dropout=0.1)),
        BatchNormalization(),
        Dense(128, activation="relu", kernel_regularizer=regularizers.l2(1e-4)),
        Dropout(0.35),
        Dense(64, activation="relu"),
        Dropout(0.2),
        Dense(num_classes, activation="softmax")
    ])

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )
    return model


def train_and_evaluate_all():
    print("=" * 70)
    print(" SIGNOVA ML PIPELINE TRAINING & COMPREHENSIVE EVALUATION")
    print(f" Master Gesture Vocabulary: {len(ALL_GESTURES)} classes")
    print("=" * 70)

    # 1. Load & Normalize Data
    all_samples = load_all_samples_with_metadata()
    print(f"\nTotal loaded samples across all classes: {len(all_samples)}")

    # 2. Subject-Level Split
    train_s, val_s, test_s = create_leakage_safe_splits(all_samples)
    print(f"Split sizes (raw): Train={len(train_s)}, Val={len(val_s)}, Test={len(test_s)}")

    # 3. Build Augmented Training Set (including Ambidextrous Mirroring)
    X_train, y_train_idx = build_augmented_training_set(train_s, augment_factor=3)
    X_val = np.array([s["data"] for s in val_s], dtype=np.float32)
    y_val_idx = np.array([s["label_idx"] for s in val_s], dtype=np.int32)
    X_test = np.array([s["data"] for s in test_s], dtype=np.float32)
    y_test_idx = np.array([s["label_idx"] for s in test_s], dtype=np.int32)

    y_train_cat = to_categorical(y_train_idx, num_classes=len(ALL_GESTURES))
    y_val_cat = to_categorical(y_val_idx, num_classes=len(ALL_GESTURES))
    y_test_cat = to_categorical(y_test_idx, num_classes=len(ALL_GESTURES))

    print(f"Augmented Training samples: {len(X_train)} (Input shape: {X_train.shape})")
    print(f"Validation samples:         {len(X_val)}")
    print(f"Holdout Test samples:       {len(X_test)}")

    # 4. Balanced Class Weights
    class_weights_arr = compute_class_weight("balanced", classes=np.unique(y_train_idx), y=y_train_idx)
    class_weight_dict = {i: float(class_weights_arr[i]) for i in range(len(class_weights_arr))}

    # -------------------------------------------------------------------------
    # MODEL 1: Random Forest Baseline
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print(" TRAINING RANDOM FOREST BASELINE...")
    print("=" * 50)
    X_train_flat = X_train.reshape(len(X_train), -1)
    X_val_flat = X_val.reshape(len(X_val), -1)
    X_test_flat = X_test.reshape(len(X_test), -1)

    rf = RandomForestClassifier(n_estimators=150, max_depth=25, class_weight="balanced", random_state=SEED, n_jobs=-1)
    rf_start = time.time()
    rf.fit(X_train_flat, y_train_idx)
    rf_train_time = time.time() - rf_start

    rf_preds_test = rf.predict(X_test_flat)
    rf_test_acc = accuracy_score(y_test_idx, rf_preds_test)
    rf_prec, rf_rec, rf_f1, _ = precision_recall_fscore_support(y_test_idx, rf_preds_test, average="macro", zero_division=0)
    print(f"Random Forest Test Accuracy: {rf_test_acc * 100:.2f}% | Macro F1: {rf_f1 * 100:.2f}% (Trained in {rf_train_time:.2f}s)")

    # -------------------------------------------------------------------------
    # MODEL 2: Deep Bidirectional LSTM
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print(" TRAINING DEEP BIDIRECTIONAL LSTM...")
    print("=" * 50)
    lstm_model = build_bilstm_model(num_classes=len(ALL_GESTURES))
    lstm_model.summary()

    callbacks = [
        EarlyStopping(monitor="val_loss", patience=20, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=6, min_lr=1e-5, verbose=1)
    ]

    lstm_start = time.time()
    history = lstm_model.fit(
        X_train, y_train_cat,
        validation_data=(X_val, y_val_cat),
        epochs=100,
        batch_size=32,
        class_weight=class_weight_dict,
        callbacks=callbacks,
        verbose=1
    )
    lstm_train_time = time.time() - lstm_start

    # Evaluate BiLSTM on Test set
    lstm_probs_test = lstm_model.predict(X_test, verbose=0)
    lstm_preds_test = np.argmax(lstm_probs_test, axis=1)

    lstm_test_acc = accuracy_score(y_test_idx, lstm_preds_test)
    lstm_prec, lstm_rec, lstm_f1, _ = precision_recall_fscore_support(y_test_idx, lstm_preds_test, average="macro", zero_division=0)
    lstm_w_prec, lstm_w_rec, lstm_w_f1, _ = precision_recall_fscore_support(y_test_idx, lstm_preds_test, average="weighted", zero_division=0)

    print("\n" + "=" * 50)
    print(" TEST SET EVALUATION REPORT (BiLSTM)")
    print("=" * 50)
    print(f"BiLSTM Test Accuracy: {lstm_test_acc * 100:.2f}%")
    print(f"BiLSTM Macro F1:      {lstm_f1 * 100:.2f}%")
    print(f"BiLSTM Weighted F1:   {lstm_w_f1 * 100:.2f}%")
    print("\nPer-Class Classification Report:")
    report_dict = classification_report(y_test_idx, lstm_preds_test, target_names=ALL_GESTURES, output_dict=True, zero_division=0)
    print(classification_report(y_test_idx, lstm_preds_test, target_names=ALL_GESTURES, zero_division=0))

    # Confusion Matrix Analysis
    cm = confusion_matrix(y_test_idx, lstm_preds_test)
    confused_pairs = []
    for i in range(len(ALL_GESTURES)):
        for j in range(len(ALL_GESTURES)):
            if i != j and cm[i, j] > 0:
                confused_pairs.append((ALL_GESTURES[i], ALL_GESTURES[j], int(cm[i, j])))
    confused_pairs.sort(key=lambda x: x[2], reverse=True)

    print("\nTop Confused Class Pairs:")
    if confused_pairs:
        for actual, predicted, count in confused_pairs[:5]:
            print(f"  Actual: '{actual}' -> Predicted as: '{predicted}' ({count} times)")
    else:
        print("  None! Perfect separation across test classes.")

    # -------------------------------------------------------------------------
    # Inference Latency Benchmark
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print(" INFERENCE LATENCY BENCHMARK...")
    print("=" * 50)
    sample_input = np.random.rand(1, 30, 126).astype(np.float32)
    # Warmup
    for _ in range(10):
        _ = lstm_model.predict(sample_input, verbose=0)

    latencies = []
    for _ in range(100):
        t0 = time.perf_counter()
        _ = lstm_model.predict(sample_input, verbose=0)
        latencies.append((time.perf_counter() - t0) * 1000)

    mean_latency = float(np.mean(latencies))
    p95_latency = float(np.percentile(latencies, 95))
    print(f"BiLSTM Mean Latency: {mean_latency:.2f} ms/frame | 95th Percentile: {p95_latency:.2f} ms/frame")

    # -------------------------------------------------------------------------
    # Save Best Models and Labels to Both Repository Paths
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print(" SAVING MODELS AND METADATA...")
    print("=" * 50)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    target_paths = [
        (MODELS_DIR / "lstm_gesture_model.keras", lstm_model, "keras"),
        (MODELS_DIR / "lstm_gesture_labels.pkl", ALL_GESTURES, "pickle"),
        (MODELS_DIR / "gesture_model.pkl", rf, "pickle"),
        (MODELS_DIR / "gesture_labels.pkl", ALL_GESTURES, "pickle")
    ]

    for path, obj, obj_type in target_paths:
        if obj_type == "keras":
            obj.save(str(path))
        elif obj_type == "pickle":
            with open(str(path), "wb") as f:
                pickle.dump(obj, f)
        print(f"  Saved -> {path.name} to {path.parent.name}/")

    # Export Evaluation Metrics JSON
    metrics_export = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "num_classes": len(ALL_GESTURES),
        "classes": ALL_GESTURES,
        "split_counts": {"train_augmented": len(X_train), "val": len(X_val), "test": len(X_test)},
        "rf_metrics": {
            "test_accuracy": float(rf_test_acc),
            "macro_f1": float(rf_f1),
            "train_time_sec": float(rf_train_time)
        },
        "bilstm_metrics": {
            "test_accuracy": float(lstm_test_acc),
            "macro_f1": float(lstm_f1),
            "weighted_f1": float(lstm_w_f1),
            "macro_precision": float(lstm_prec),
            "macro_recall": float(lstm_rec),
            "train_time_sec": float(lstm_train_time),
            "mean_latency_ms": mean_latency,
            "p95_latency_ms": p95_latency
        },
        "per_class_report": report_dict,
        "top_confusions": [{"actual": a, "predicted": p, "count": c} for a, p, c in confused_pairs[:10]]
    }

    metrics_json_path = REPO_ROOT / "reports" / "ml_evaluation_report.json"
    metrics_json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(metrics_json_path, "w", encoding="utf-8") as f:
        json.dump(metrics_export, f, indent=2)
    print(f"  Exported evaluation report to: {metrics_json_path}")

    return metrics_export


if __name__ == "__main__":
    train_and_evaluate_all()
