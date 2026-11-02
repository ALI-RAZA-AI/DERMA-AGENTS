"""Tiny ONNX ModelProto writer (subset of ops) built on pbwire.

Supports the operators needed to express MobileNetV2: Conv, Relu, Clip, Add,
GlobalAveragePool, Flatten. Weights are stored as float32 raw_data initializers.
"""
from __future__ import annotations

import numpy as np

from .pbwire import f_bytes, f_float, f_str, f_varint

FLOAT = 1  # TensorProto.FLOAT
ATTR_FLOAT, ATTR_INT, ATTR_INTS = 1, 2, 7


def _attr(name: str, value) -> bytes:
    if isinstance(value, float):
        return f_str(1, name) + f_varint(20, ATTR_FLOAT) + f_float(2, value)
    if isinstance(value, int):
        return f_str(1, name) + f_varint(20, ATTR_INT) + f_varint(3, value)
    if isinstance(value, (list, tuple)):
        body = f_str(1, name) + f_varint(20, ATTR_INTS)
        for v in value:
            body += f_varint(8, int(v))
        return body
    raise TypeError(value)


def _tensor(name: str, arr: np.ndarray) -> bytes:
    arr = np.ascontiguousarray(arr, dtype=np.float32)
    body = b"".join(f_varint(1, d) for d in arr.shape)
    body += f_varint(2, FLOAT) + f_str(8, name) + f_bytes(9, arr.tobytes())
    return body


def _value_info(name: str, shape) -> bytes:
    dims = b""
    for d in shape:
        dims += f_bytes(1, f_str(2, d) if isinstance(d, str) else f_varint(1, d))
    tensor_type = f_varint(1, FLOAT) + f_bytes(2, dims)
    return f_str(1, name) + f_bytes(2, f_bytes(1, tensor_type))


class GraphBuilder:
    def __init__(self, name: str):
        self.name = name
        self.nodes: list[bytes] = []
        self.inits: list[bytes] = []
        self.inputs: list[bytes] = []
        self.outputs: list[bytes] = []

    def node(self, op: str, inputs, outputs, name: str, **attrs) -> None:
        body = b"".join(f_str(1, i) for i in inputs)
        body += b"".join(f_str(2, o) for o in outputs)
        body += f_str(3, name) + f_str(4, op)
        for k, v in attrs.items():
            body += f_bytes(5, _attr(k, v))
        self.nodes.append(body)

    def init(self, name: str, arr: np.ndarray) -> str:
        self.inits.append(_tensor(name, arr))
        return name

    def input(self, name: str, shape) -> None:
        self.inputs.append(_value_info(name, shape))

    def output(self, name: str, shape) -> None:
        self.outputs.append(_value_info(name, shape))

    def serialize(self, opset: int = 13) -> bytes:
        g = b"".join(f_bytes(1, n) for n in self.nodes)
        g += f_str(2, self.name)
        g += b"".join(f_bytes(5, t) for t in self.inits)
        g += b"".join(f_bytes(11, i) for i in self.inputs)
        g += b"".join(f_bytes(12, o) for o in self.outputs)
        model = f_varint(1, 8)  # ir_version 8
        model += f_str(2, "dermaagents-caffe2onnx")
        model += f_bytes(7, g)
        model += f_bytes(8, f_str(1, "") + f_varint(2, opset))
        return model
