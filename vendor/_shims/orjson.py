"""orjson stand-in built on the stdlib json module."""
import dataclasses, datetime, enum, json, uuid

OPT_NON_STR_KEYS = 1 << 0
OPT_SERIALIZE_NUMPY = 1 << 1
OPT_SERIALIZE_UUID = 1 << 2
OPT_SERIALIZE_DATACLASS = 1 << 3
OPT_PASSTHROUGH_SUBCLASS = 1 << 4
OPT_PASSTHROUGH_DATETIME = 1 << 5
OPT_PASSTHROUGH_DATACLASS = 1 << 6
OPT_INDENT_2 = 1 << 7
OPT_SORT_KEYS = 1 << 8
OPT_UTC_Z = 1 << 9
OPT_NAIVE_UTC = 1 << 10
OPT_OMIT_MICROSECONDS = 1 << 11
OPT_APPEND_NEWLINE = 1 << 12
OPT_STRICT_INTEGER = 1 << 13
JSONDecodeError = json.JSONDecodeError
JSONEncodeError = TypeError

class Fragment:
    def __init__(self, contents):
        self.contents = contents if isinstance(contents, (bytes, str)) else bytes(contents)

def _prep(o, default, opts):
    if isinstance(o, Fragment):
        c = o.contents
        return json.loads(c.decode() if isinstance(c, bytes) else c)
    if isinstance(o, dict):
        return {(k if isinstance(k, str) else str(k)): _prep(v, default, opts) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_prep(v, default, opts) for v in o]
    if isinstance(o, (str, int, float, bool)) or o is None:
        return o
    if isinstance(o, (datetime.datetime, datetime.date, datetime.time)) and not opts & OPT_PASSTHROUGH_DATETIME:
        return o.isoformat()
    if isinstance(o, uuid.UUID):
        return str(o)
    if isinstance(o, enum.Enum):
        return _prep(o.value, default, opts)
    if dataclasses.is_dataclass(o) and not isinstance(o, type) and not opts & OPT_PASSTHROUGH_DATACLASS:
        return _prep(dataclasses.asdict(o), default, opts)
    try:
        import numpy as np
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, np.generic):
            return o.item()
    except ImportError:
        pass
    if default is not None:
        return _prep(default(o), default, opts)
    raise TypeError(f"Type is not JSON serializable: {type(o).__name__}")

def dumps(obj, default=None, option=None):
    opts = option or 0
    s = json.dumps(_prep(obj, default, opts), ensure_ascii=False, separators=(",", ":"),
                   indent=2 if opts & OPT_INDENT_2 else None, sort_keys=bool(opts & OPT_SORT_KEYS))
    if opts & OPT_APPEND_NEWLINE:
        s += "\n"
    return s.encode()

def loads(data):
    if isinstance(data, (bytes, bytearray, memoryview)):
        data = bytes(data).decode()
    return json.loads(data)
