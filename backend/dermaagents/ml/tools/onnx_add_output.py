"""Expose an intermediate tensor of an ONNX model as an extra graph output
(wire-level edit; the `onnx` package is unavailable in the build sandbox)."""
from __future__ import annotations

import sys

from .onnx_builder import _value_info
from .pbwire import enc_varint, f_bytes, iter_fields


def add_output(src: str, dst: str, tensor: str, shape) -> None:
    data = open(src, "rb").read()
    out = bytearray()
    for field, wt, val in iter_fields(data):
        key = enc_varint((field << 3) | wt)
        if field == 7 and wt == 2:  # graph
            graph = bytes(val) + f_bytes(12, _value_info(tensor, shape))
            out += f_bytes(7, graph)
        elif wt == 0:
            out += key + enc_varint(val)
        elif wt == 2:
            out += f_bytes(field, bytes(val))
        else:
            out += key + bytes(val)
    open(dst, "wb").write(bytes(out))


if __name__ == "__main__":
    add_output(sys.argv[1], sys.argv[2], sys.argv[3], ["N", 2048, 1, 1])
