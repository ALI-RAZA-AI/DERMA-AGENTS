"""Pretrained ImageNet backbones (ONNX) used as frozen feature extractors.

All three weights files are genuine ImageNet-pretrained models obtained from
public GitHub repositories (see MODEL_SOURCES) and verified to classify a
reference cat photo correctly after conversion.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from ..config import MODELS_DIR  # noqa: E402  (single source of truth for the active checkpoint)

MODEL_SOURCES = {
    "mobilenetv2": {
        "source": "github.com/shicai/MobileNet-Caffe (mobilenet_v2.caffemodel, BSD-3-Clause), "
                  "converted Caffe->ONNX with dermaagents.ml.tools.caffe2onnx_mobilenetv2",
        "paper": "Sandler et al., MobileNetV2: Inverted Residuals and Linear Bottlenecks, CVPR 2018",
    },
    "resnet50": {
        "source": "github.com/microsoft/onnxjs-demo (docs/resnet50v2.onnx, MIT; ONNX Model Zoo ResNet50-v2), "
                  "pooled-feature output exposed with dermaagents.ml.tools.onnx_add_output",
        "paper": "He et al., Identity Mappings in Deep Residual Networks, ECCV 2016",
    },
    "efficientnet": {
        "source": "github.com/google-coral/test_data (efficientnet-edgetpu-M_quant.tflite, Apache-2.0), "
                  "weights de-quantized to float ONNX with dermaagents.ml.tools.tflite2onnx_efficientnet",
        "paper": "Tan & Le, EfficientNet (EdgeTPU variant, Google AI blog 2019)",
    },
}


@dataclass
class BackboneSpec:
    name: str
    file: str
    input_name: str
    output_name: str
    size: int          # crop size
    resize: int        # shorter-side resize before center crop
    rgb: bool
    mean: tuple
    std: tuple
    batchable: bool = True
    extra: dict = field(default_factory=dict)


SPECS = {
    "mobilenetv2": BackboneSpec("mobilenetv2", "mobilenetv2_imagenet.onnx", "data", "pool6", 224, 256,
                                rgb=False, mean=(103.94, 116.78, 123.68), std=(1 / 0.017,) * 3),
    "resnet50": BackboneSpec("resnet50", "resnet50v2_imagenet.onnx", "data", "resnetv24_pool1_fwd", 224, 256,
                             rgb=True, mean=(123.675, 116.28, 103.53), std=(58.395, 57.12, 57.375),
                             batchable=False),
    "efficientnet": BackboneSpec("efficientnet", "efficientnet_edgetpu_m_imagenet.onnx", "images", "embedding",
                                 240, 274, rgb=True, mean=(127.0,) * 3, std=(128.0,) * 3),
}


def center_crop(img: np.ndarray, resize: int, size: int) -> np.ndarray:
    h, w = img.shape[:2]
    s = resize / min(h, w)
    img = cv2.resize(img, (max(size, round(w * s)), max(size, round(h * s))), interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    y, x = (h - size) // 2, (w - size) // 2
    return img[y:y + size, x:x + size]


class Backbone:
    def __init__(self, name: str, threads: int | None = None):
        import onnxruntime as ort
        self.spec = SPECS[name]
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads or max(1, os.cpu_count() or 1)
        so.log_severity_level = 3
        self.sess = ort.InferenceSession(str(MODELS_DIR / self.spec.file), so,
                                         providers=["CPUExecutionProvider"])

    def to_tensor(self, crops_bgr: list[np.ndarray]) -> np.ndarray:
        sp = self.spec
        x = np.stack(crops_bgr).astype(np.float32)
        if sp.rgb:
            x = x[..., ::-1]
        x = (x - np.array(sp.mean, np.float32)) / np.array(sp.std, np.float32)
        return np.ascontiguousarray(x.transpose(0, 3, 1, 2))

    def embed_crops(self, crops_bgr: list[np.ndarray], batch: int = 16) -> np.ndarray:
        sp = self.spec
        out = []
        bs = batch if sp.batchable else 1
        for i in range(0, len(crops_bgr), bs):
            x = self.to_tensor(crops_bgr[i:i + bs])
            f = self.sess.run([sp.output_name], {sp.input_name: x})[0]
            out.append(f.reshape(f.shape[0], -1))
        return np.concatenate(out).astype(np.float32)

    def embed_images(self, images_bgr: list[np.ndarray], tta_flip: bool = True) -> np.ndarray:
        sp = self.spec
        crops = [center_crop(im, sp.resize, sp.size) for im in images_bgr]
        f = self.embed_crops(crops)
        if tta_flip:
            f = (f + self.embed_crops([c[:, ::-1] for c in crops])) / 2
        return f


class MultiBackbone:
    """Concatenation of several backbones' L2-normalised embeddings."""

    def __init__(self, names: list[str], threads: int | None = None):
        self.parts = [Backbone(n, threads) for n in names]

    def embed_images(self, images_bgr: list[np.ndarray], tta_flip: bool = True) -> np.ndarray:
        from sklearn.preprocessing import normalize
        return np.hstack([normalize(p.embed_images(images_bgr, tta_flip)) for p in self.parts])


def make_backbone(name: str, threads: int | None = None):
    if name == "ensemble":
        return MultiBackbone(["mobilenetv2", "efficientnet", "resnet50"], threads)
    return Backbone(name, threads)
