"""Convert the Coral EfficientNet-EdgeTPU (ImageNet, post-training-quantized) TFLite
model to a float ONNX graph by de-quantizing its weights.

OpenCV 5's TFLite importer rejects these quantized graphs, and TensorFlow / tf2onnx
are not installable in the build sandbox. The graph only uses CONV_2D,
DEPTHWISE_CONV_2D, ADD, MEAN, FULLY_CONNECTED, QUANTIZE and SOFTMAX, so a direct
conversion is small. Activations run in float32; weights are de-quantized as
scale * (q - zero_point) (per-channel where provided).

Outputs: "embedding" (global-average-pooled features) and "logits".
Usage: python -m dermaagents.ml.tools.tflite2onnx_efficientnet <model.tflite> <out.onnx>
Requires the generated `tflite` schema package (github.com/zhenhuaw-me/tflite) on PYTHONPATH.
"""
from __future__ import annotations

import math
import sys

import numpy as np
import tflite  # type: ignore

from .onnx_builder import GraphBuilder

_DT = {0: np.float32, 2: np.int32, 3: np.uint8, 9: np.int8, 4: np.int64, 7: np.int16}


def _opname(model, op) -> str:
    code = model.OperatorCodes(op.OpcodeIndex())
    c = max(code.BuiltinCode(), code.DeprecatedBuiltinCode())
    for k, v in tflite.BuiltinOperator.__dict__.items():
        if v == c and not k.startswith("_"):
            return k
    raise KeyError(c)


def _const(model, tensor):
    buf = model.Buffers(tensor.Buffer())
    if buf is None or buf.DataLength() == 0:
        return None
    raw = buf.DataAsNumpy().tobytes()
    arr = np.frombuffer(raw, dtype=_DT[tensor.Type()]).reshape(tensor.ShapeAsNumpy())
    q = tensor.Quantization()
    if tensor.Type() != 0 and q is not None and q.ScaleLength() > 0:
        scale = q.ScaleAsNumpy().astype(np.float32)
        zp = q.ZeroPointAsNumpy().astype(np.float32) if q.ZeroPointLength() else np.zeros_like(scale)
        if scale.size > 1:
            shape = [1] * arr.ndim
            shape[q.QuantizedDimension()] = -1
            scale, zp = scale.reshape(shape), zp.reshape(shape)
        return ((arr.astype(np.float32) - zp) * scale).astype(np.float32)
    return arr.astype(np.float32)


def _same_pads(in_hw, k, s):
    pads_b, pads_e = [], []
    for size, kk, ss in zip(in_hw, k, s):
        out = math.ceil(size / ss)
        total = max((out - 1) * ss + kk - size, 0)
        pads_b.append(total // 2)
        pads_e.append(total - total // 2)
    return pads_b + pads_e


def convert(tfl_path: str, out_path: str) -> dict:
    buf = open(tfl_path, "rb").read()
    model = tflite.Model.GetRootAsModel(buf, 0)
    sg = model.Subgraphs(0)
    g = GraphBuilder("efficientnet_edgetpu")
    T = lambda i: sg.Tensors(i)  # noqa: E731
    name = lambda i: T(i).Name().decode().replace("/", "_")  # noqa: E731

    inp = T(sg.Inputs(0))
    _, H, W, C = inp.ShapeAsNumpy()
    q = inp.Quantization()
    in_scale, in_zp = float(q.ScaleAsNumpy()[0]), float(q.ZeroPointAsNumpy()[0])
    g.input("images", ["N", int(C), int(H), int(W)])
    alias = {int(sg.Inputs(0)): "images"}
    emb_name = None

    def qclip(out, tidx, nodename):
        """Emulate int8 saturation of the output tensor (this is how the quantized
        graph encodes ReLU-style clamping when no fused activation is recorded)."""
        q = T(tidx).Quantization()
        if q is None or q.ScaleLength() == 0:
            return out
        sc, zp = float(q.ScaleAsNumpy()[0]), float(q.ZeroPointAsNumpy()[0])
        qmin, qmax = (-128, 127) if T(tidx).Type() == 9 else (0, 255)
        lo = g.init(nodename + "_qlo", np.array(sc * (qmin - zp), np.float32))
        hi = g.init(nodename + "_qhi", np.array(sc * (qmax - zp), np.float32))
        g.node("Clip", [out, lo, hi], [out + "_q"], nodename + "_qclip")
        return out + "_q"

    def act(out, fused, nodename):
        if fused == 1:
            g.node("Relu", [out], [out + "_relu"], nodename + "_relu")
            return out + "_relu"
        if fused == 3:
            lo = g.init(nodename + "_lo", np.array(0, np.float32))
            hi = g.init(nodename + "_hi", np.array(6, np.float32))
            g.node("Clip", [out, lo, hi], [out + "_relu6"], nodename + "_relu6")
            return out + "_relu6"
        assert fused == 0, fused
        return out

    for i in range(sg.OperatorsLength()):
        op = sg.Operators(i)
        typ = _opname(model, op)
        ins, outs = [int(x) for x in op.InputsAsNumpy()], [int(x) for x in op.OutputsAsNumpy()]
        oname = name(outs[0])
        nn = f"op{i}_{typ.lower()}"
        if typ == "QUANTIZE":
            alias[outs[0]] = alias[ins[0]]
            continue
        if typ in ("CONV_2D", "DEPTHWISE_CONV_2D"):
            opts_cls = tflite.Conv2DOptions if typ == "CONV_2D" else tflite.DepthwiseConv2DOptions
            o = opts_cls()
            o.Init(op.BuiltinOptions().Bytes, op.BuiltinOptions().Pos)
            w = _const(model, T(ins[1]))
            b = _const(model, T(ins[2])) if len(ins) > 2 and ins[2] >= 0 else np.zeros(w.shape[0] if typ == "CONV_2D" else w.shape[3], np.float32)
            in_shape = T(ins[0]).ShapeAsNumpy()
            if typ == "CONV_2D":
                wk = w.transpose(0, 3, 1, 2)  # O,kh,kw,I -> O,I,kh,kw
                group = 1
            else:
                wk = w.transpose(3, 0, 1, 2)  # 1,kh,kw,C -> C,1,kh,kw
                group = int(in_shape[3])
            k = [wk.shape[2], wk.shape[3]]
            s = [o.StrideH(), o.StrideW()]
            pads = _same_pads(in_shape[1:3], k, s) if o.Padding() == 0 else [0, 0, 0, 0]
            wn, bn = g.init(nn + "_W", wk), g.init(nn + "_B", b.reshape(-1))
            g.node("Conv", [alias[ins[0]], wn, bn], [oname], nn, kernel_shape=k, strides=s, pads=pads, group=group)
            alias[outs[0]] = qclip(act(oname, o.FusedActivationFunction(), nn), outs[0], nn)
        elif typ == "ADD":
            o = tflite.AddOptions()
            o.Init(op.BuiltinOptions().Bytes, op.BuiltinOptions().Pos)
            g.node("Add", [alias[ins[0]], alias[ins[1]]], [oname], nn)
            alias[outs[0]] = qclip(act(oname, o.FusedActivationFunction(), nn), outs[0], nn)
        elif typ == "MEAN":
            g.node("GlobalAveragePool", [alias[ins[0]]], [oname + "_4d"], nn)
            g.node("Flatten", [oname + "_4d"], ["embedding"], nn + "_flat", axis=1)
            alias[outs[0]] = "embedding"
            emb_name = "embedding"
            emb_dim = int(T(outs[0]).ShapeAsNumpy()[-1])
        elif typ == "FULLY_CONNECTED":
            w = _const(model, T(ins[1]))
            b = _const(model, T(ins[2]))
            wn, bn = g.init(nn + "_W", w), g.init(nn + "_B", b)
            g.node("Gemm", [alias[ins[0]], wn, bn], ["logits"], nn, transB=1)
            alias[outs[0]] = "logits"
            n_logits = w.shape[0]
        elif typ == "SOFTMAX":
            alias[outs[0]] = alias[ins[0]]
        else:
            raise NotImplementedError(typ)

    g.output(emb_name, ["N", emb_dim])
    g.output("logits", ["N", n_logits])
    with open(out_path, "wb") as f:
        f.write(g.serialize())
    return {"input_hw": [int(H), int(W)], "input_scale": in_scale, "input_zero_point": in_zp,
            "embedding_dim": emb_dim, "n_logits": int(n_logits)}


if __name__ == "__main__":
    print(convert(sys.argv[1], sys.argv[2]))
