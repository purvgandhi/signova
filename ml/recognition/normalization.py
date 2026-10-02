"""
Standardized Landmark Normalization for Signova Recognition Pipeline
Provides invariant mathematical representation of MediaPipe hand landmarks:
- Translation-invariant (wrist-centered)
- Scale/distance-invariant (normalized by palm span ||Wrist - Middle_MCP||)
- Relative inter-hand orientation & distance encoding for two-handed gestures
- Shared identically across training, validation, and real-time inference
"""
from __future__ import annotations

import numpy as np
from typing import List, Union

def normalize_landmarks_frame(frame_126: Union[np.ndarray, List[float]]) -> np.ndarray:
    """
    Normalizes a single frame of 126 floats (63 Left Hand + 63 Right Hand).
    Input: shape (126,)
    Output: shape (126,) float32 normalized features
    """
    if isinstance(frame_126, list):
        frame_126 = np.array(frame_126, dtype=np.float32)
    elif frame_126.dtype != np.float32:
        frame_126 = frame_126.astype(np.float32)

    norm = np.zeros(126, dtype=np.float32)
    lh = frame_126[:63]
    rh = frame_126[63:]

    lh_present = bool(np.any(lh != 0.0))
    rh_present = bool(np.any(rh != 0.0))

    lh_scale = 1.0
    rh_scale = 1.0

    if lh_present:
        lx0, ly0, lz0 = lh[0], lh[1], lh[2]
        lx9, ly9, lz9 = lh[27], lh[28], lh[29]
        lh_scale = float(np.sqrt((lx9 - lx0)**2 + (ly9 - ly0)**2 + (lz9 - lz0)**2))
        if lh_scale < 1e-4:
            lh_scale = 1.0

        for k in range(21):
            norm[3 * k] = (lh[3 * k] - lx0) / lh_scale
            norm[3 * k + 1] = (lh[3 * k + 1] - ly0) / lh_scale
            norm[3 * k + 2] = (lh[3 * k + 2] - lz0) / lh_scale

    if rh_present:
        rx0, ry0, rz0 = rh[0], rh[1], rh[2]
        rx9, ry9, rz9 = rh[27], rh[28], rh[29]
        rh_scale = float(np.sqrt((rx9 - rx0)**2 + (ry9 - ry0)**2 + (rz9 - rz0)**2))
        if rh_scale < 1e-4:
            rh_scale = 1.0

        for k in range(21):
            norm[63 + 3 * k] = (rh[3 * k] - rx0) / rh_scale
            norm[63 + 3 * k + 1] = (rh[3 * k + 1] - ry0) / rh_scale
            norm[63 + 3 * k + 2] = (rh[3 * k + 2] - rz0) / rh_scale

    # If both hands are present, encode normalized relative distance & orientation vector in rh wrist
    if lh_present and rh_present:
        avg_scale = (lh_scale + rh_scale) / 2.0
        norm[63] = (rh[0] - lh[0]) / avg_scale
        norm[64] = (rh[1] - lh[1]) / avg_scale
        norm[65] = (rh[2] - lh[2]) / avg_scale

    return norm


def normalize_landmarks_sequence(seq_30x126: np.ndarray) -> np.ndarray:
    """
    Normalizes a temporal sequence of shape (T, 126) or (N, T, 126).
    """
    if seq_30x126.ndim == 2:
        out = np.zeros_like(seq_30x126, dtype=np.float32)
        for t in range(seq_30x126.shape[0]):
            out[t] = normalize_landmarks_frame(seq_30x126[t])
        return out
    elif seq_30x126.ndim == 3:
        out = np.zeros_like(seq_30x126, dtype=np.float32)
        for i in range(seq_30x126.shape[0]):
            for t in range(seq_30x126.shape[1]):
                out[i, t] = normalize_landmarks_frame(seq_30x126[i, t])
        return out
    else:
        raise ValueError(f"Unexpected array shape for landmark normalization: {seq_30x126.shape}")
