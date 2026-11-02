"""OpenCV training-time augmentation (applied before frozen-feature extraction)."""
from __future__ import annotations

import cv2
import numpy as np


def random_resized_crop(img, size, rng, scale=(0.55, 1.0), ratio=(3 / 4, 4 / 3)):
    h, w = img.shape[:2]
    area = h * w
    for _ in range(10):
        a = area * rng.uniform(*scale)
        r = np.exp(rng.uniform(np.log(ratio[0]), np.log(ratio[1])))
        cw, ch = int(round(np.sqrt(a * r))), int(round(np.sqrt(a / r)))
        if 0 < cw <= w and 0 < ch <= h:
            x, y = rng.integers(0, w - cw + 1), rng.integers(0, h - ch + 1)
            return cv2.resize(img[y:y + ch, x:x + cw], (size, size), interpolation=cv2.INTER_AREA)
    s = min(h, w)
    return cv2.resize(img[(h - s) // 2:(h - s) // 2 + s, (w - s) // 2:(w - s) // 2 + s], (size, size))


def augment(img_bgr: np.ndarray, size: int, rng: np.random.Generator) -> np.ndarray:
    x = random_resized_crop(img_bgr, size, rng)
    if rng.random() < 0.5:
        x = x[:, ::-1]
    if rng.random() < 0.3:
        x = x[::-1]
    # rotation
    ang = rng.uniform(-25, 25)
    M = cv2.getRotationMatrix2D((size / 2, size / 2), ang, 1.0)
    x = cv2.warpAffine(np.ascontiguousarray(x), M, (size, size), borderMode=cv2.BORDER_REFLECT_101)
    # brightness / contrast / saturation jitter (mild: colour carries diagnostic signal)
    hsv = cv2.cvtColor(x, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] *= rng.uniform(0.85, 1.15)
    hsv[..., 2] = hsv[..., 2] * rng.uniform(0.85, 1.15) + rng.uniform(-12, 12)
    x = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    if rng.random() < 0.2:
        x = cv2.GaussianBlur(x, (3, 3), 0)
    return np.ascontiguousarray(x)
