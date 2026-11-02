"""Convert shicai/MobileNet-Caffe MobileNetV2 (ImageNet-pretrained) to ONNX.

Why: OpenCV 5 dropped its Caffe importer and the onnx/torch packages are not
installable in the build sandbox, so we decode the .caffemodel protobuf directly,
fold BatchNorm+Scale into the convolutions and write an ONNX graph whose
outputs are the 1280-d global-pool embedding ("pool6") and ImageNet logits ("fc7").

Usage:
    python -m dermaagents.ml.tools.caffe2onnx_mobilenetv2 <prototxt> <caffemodel> <out.onnx>
"""
from __future__ import annotations

import re
import struct
import sys

import numpy as np

from .onnx_builder import GraphBuilder
from .pbwire import iter_fields, packed_varints


# ------------------------------------------------------------ prototxt parse
def parse_prototxt(text: str) -> list[dict]:
    text = re.sub(r"#.*", "", text)
    tokens = re.findall(r'"[^"]*"|[{}:]|[^\s{}:"]+', text)
    pos = 0

    def parse_block():
        nonlocal pos
        d: dict = {}
        while pos < len(tokens) and tokens[pos] != "}":
            key = tokens[pos]
            pos += 1
            if tokens[pos] == ":":
                pos += 1
                val = tokens[pos].strip('"')
                pos += 1
            else:  # nested block
                assert tokens[pos] == "{"
                pos += 1
                val = parse_block()
                assert tokens[pos] == "}"
                pos += 1
            d.setdefault(key, []).append(val)
        return d

    root = parse_block()
    return root.get("layer", [])


def first(d: dict, key: str, default=None):
    v = d.get(key)
    return v[0] if v else default


# ------------------------------------------------------------ caffemodel parse
def read_blobs(path: str) -> dict[str, list[np.ndarray]]:
    data = open(path, "rb").read()
    out: dict[str, list[np.ndarray]] = {}
    for field, wt, val in iter_fields(data):
        if field != 100:  # NetParameter.layer
            continue
        name, blobs = None, []
        for lf, lwt, lval in iter_fields(val):
            if lf == 1:
                name = bytes(lval).decode()
            elif lf == 7:  # BlobProto
                shape, floats = [], []
                legacy = {}
                for bf, bwt, bval in iter_fields(lval):
                    if bf == 7:  # BlobShape
                        for sf, swt, sval in iter_fields(bval):
                            if sf == 1:
                                shape += packed_varints(sval) if swt == 2 else [sval]
                    elif bf == 5:
                        if bwt == 2:
                            floats.append(np.frombuffer(bytes(bval), dtype="<f4"))
                        else:
                            floats.append(np.array(struct.unpack("<f", bytes(bval)), dtype="<f4"))
                    elif bf in (1, 2, 3, 4):
                        legacy[bf] = bval
                arr = np.concatenate(floats) if floats else np.zeros(0, np.float32)
                if not shape and legacy:
                    shape = [legacy.get(k, 1) for k in (1, 2, 3, 4)]
                blobs.append(arr.reshape(shape) if shape else arr)
        if name is not None:
            out[name] = blobs
    return out


# ------------------------------------------------------------ conversion
def convert(prototxt: str, caffemodel: str, out_path: str) -> None:
    layers = parse_prototxt(open(prototxt).read())
    blobs = read_blobs(caffemodel)
    g = GraphBuilder("mobilenet_v2")
    g.input("data", ["N", 3, 224, 224])

    alias: dict[str, str] = {"data": "data"}  # caffe blob name -> current onnx tensor
    pending_conv: dict[str, dict] = {}  # caffe top -> conv params awaiting BN/Scale fold
    emitted = set()

    def emit_conv(top: str):
        p = pending_conv.pop(top)
        W, b = p["W"], p["b"]
        wname = g.init(p["name"] + "_W", W)
        bname = g.init(p["name"] + "_B", b)
        out = p["name"] + "_out"
        g.node("Conv", [p["input"], wname, bname], [out], p["name"],
               kernel_shape=[p["k"], p["k"]], strides=[p["s"], p["s"]],
               pads=[p["pad"]] * 4, group=p["group"])
        alias[top] = out
        emitted.add(top)

    for L in layers:
        typ = first(L, "type")
        name = first(L, "name")
        bottoms = L.get("bottom", [])
        top = first(L, "top")
        if typ == "Convolution":
            cp = first(L, "convolution_param", {})
            W = blobs[name][0].astype(np.float32)
            bias_term = first(cp, "bias_term", "true") != "false"
            b = blobs[name][1].astype(np.float32) if bias_term and len(blobs[name]) > 1 else np.zeros(W.shape[0], np.float32)
            src = bottoms[0]
            if src in pending_conv:
                emit_conv(src)
            pending_conv[top] = dict(
                name=name.replace("/", "_"), W=W, b=b, input=alias[src],
                k=int(first(cp, "kernel_size", 1)), s=int(first(cp, "stride", 1)),
                pad=int(first(cp, "pad", 0)), group=int(first(cp, "group", 1)))
        elif typ == "BatchNorm":
            mean, var, sf = blobs[name][0], blobs[name][1], blobs[name][2]
            s = float(sf.ravel()[0])
            s = 0.0 if s == 0 else 1.0 / s
            mean, var = mean * s, var * s
            eps = float(first(first(L, "batch_norm_param", {}), "eps", 1e-5))
            p = pending_conv.pop(bottoms[0])
            inv = 1.0 / np.sqrt(var + eps)
            p["W"] = p["W"] * inv[:, None, None, None]
            p["b"] = (p["b"] - mean) * inv
            pending_conv[top] = p
        elif typ == "Scale":
            gamma, beta = blobs[name][0], blobs[name][1]
            p = pending_conv.pop(bottoms[0])
            p["W"] = p["W"] * gamma[:, None, None, None]
            p["b"] = p["b"] * gamma + beta
            pending_conv[top] = p
        elif typ == "ReLU":
            if bottoms[0] in pending_conv:
                emit_conv(bottoms[0])
            out = name.replace("/", "_") + "_out"
            g.node("Relu", [alias[bottoms[0]]], [out], name.replace("/", "_"))
            alias[top] = out
        elif typ == "Eltwise":
            for bt in bottoms:
                if bt in pending_conv:
                    emit_conv(bt)
            out = name.replace("/", "_") + "_out"
            g.node("Add", [alias[bottoms[0]], alias[bottoms[1]]], [out], name.replace("/", "_"))
            alias[top] = out
        elif typ == "Pooling":
            if bottoms[0] in pending_conv:
                emit_conv(bottoms[0])
            g.node("GlobalAveragePool", [alias[bottoms[0]]], ["pool6_4d"], "pool6")
            g.node("Flatten", ["pool6_4d"], ["pool6"], "pool6_flatten", axis=1)
            alias[top] = "pool6_4d"
        elif typ == "Softmax":
            pass
        else:
            raise NotImplementedError(typ)

    # final classifier conv (fc7) on pooled features
    for t in list(pending_conv):
        emit_conv(t)
    g.node("Flatten", [alias["fc7"]], ["fc7"], "fc7_flatten", axis=1)
    g.output("pool6", ["N", 1280])
    g.output("fc7", ["N", 1000])
    with open(out_path, "wb") as f:
        f.write(g.serialize())


if __name__ == "__main__":
    convert(*sys.argv[1:4])
    print("wrote", sys.argv[3])
