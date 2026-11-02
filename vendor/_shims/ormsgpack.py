"""ormsgpack stand-in built on msgpack (only the API LangGraph's serializer uses)."""
import msgpack

OPT_NON_STR_KEYS = 1
OPT_PASSTHROUGH_DATACLASS = 2
OPT_PASSTHROUGH_DATETIME = 4
OPT_PASSTHROUGH_ENUM = 8
OPT_PASSTHROUGH_UUID = 16
OPT_REPLACE_SURROGATES = 32
OPT_PASSTHROUGH_TUPLE = 64
OPT_PASSTHROUGH_SUBCLASS = 128
OPT_SERIALIZE_NUMPY = 256
OPT_SERIALIZE_PYDANTIC = 512
OPT_PASSTHROUGH_BIG_INT = 1024
OPT_DATETIME_AS_TIMESTAMP_EXT = 2048
MsgpackDecodeError = ValueError
MsgpackEncodeError = TypeError


class Ext:
    def __init__(self, tag, data):
        self.tag, self.data = tag, data


_NATIVE = (str, int, float, bool, bytes, type(None))


def _walk(o, opts):
    t = type(o)
    if t in _NATIVE:
        return o
    if t is dict:
        return {_walk(k, opts): _walk(v, opts) for k, v in o.items()}
    if t is list or (t is tuple and not opts & OPT_PASSTHROUGH_TUPLE):
        return [_walk(v, opts) for v in o]
    return o  # handled by default()


def packb(obj, default=None, option=None):
    opts = option or 0

    def _default(o):
        if isinstance(o, Ext):
            return msgpack.ExtType(o.tag, o.data)
        if default is not None:
            r = default(o)
            if isinstance(r, Ext):
                return msgpack.ExtType(r.tag, r.data)
            return _walk(r, opts)
        raise TypeError(f"Type is not msgpack serializable: {type(o).__name__}")

    return msgpack.packb(_walk(obj, opts), default=_default, use_bin_type=True, strict_types=True)


def unpackb(data, ext_hook=None, option=None):
    def _hook(code, d):
        return ext_hook(code, d) if ext_hook else msgpack.ExtType(code, d)
    return msgpack.unpackb(data, ext_hook=_hook, raw=False, strict_map_key=False)
