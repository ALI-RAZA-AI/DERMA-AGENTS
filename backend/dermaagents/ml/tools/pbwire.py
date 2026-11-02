"""Minimal protobuf wire-format reader/writer.

Used only by the offline model-conversion tools (Caffe -> ONNX) because the
`onnx` and `caffe` Python packages are not installable in the build sandbox.
"""
from __future__ import annotations

import struct
from typing import Iterator, Tuple


# ----------------------------------------------------------------- reading
def _varint(buf: memoryview, pos: int) -> Tuple[int, int]:
    result, shift = 0, 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, pos
        shift += 7


def iter_fields(buf) -> Iterator[Tuple[int, int, object]]:
    """Yield (field_number, wire_type, value). Length-delimited values are memoryviews."""
    buf = memoryview(buf)
    pos, n = 0, len(buf)
    while pos < n:
        key, pos = _varint(buf, pos)
        field, wt = key >> 3, key & 7
        if wt == 0:
            val, pos = _varint(buf, pos)
        elif wt == 1:
            val = buf[pos:pos + 8]
            pos += 8
        elif wt == 2:
            ln, pos = _varint(buf, pos)
            val = buf[pos:pos + ln]
            pos += ln
        elif wt == 5:
            val = buf[pos:pos + 4]
            pos += 4
        else:
            raise ValueError(f"unsupported wire type {wt}")
        yield field, wt, val


def packed_varints(buf) -> list:
    buf = memoryview(buf)
    out, pos = [], 0
    while pos < len(buf):
        v, pos = _varint(buf, pos)
        out.append(v)
    return out


# ----------------------------------------------------------------- writing
def enc_varint(v: int) -> bytes:
    if v < 0:
        v += 1 << 64
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def f_varint(field: int, v: int) -> bytes:
    return enc_varint(field << 3) + enc_varint(v)


def f_bytes(field: int, data: bytes) -> bytes:
    return enc_varint((field << 3) | 2) + enc_varint(len(data)) + data


def f_str(field: int, s: str) -> bytes:
    return f_bytes(field, s.encode())


def f_float(field: int, v: float) -> bytes:
    return enc_varint((field << 3) | 5) + struct.pack("<f", v)
