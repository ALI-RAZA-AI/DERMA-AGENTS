import os, time, uuid

def uuid7(timestamp=None, nanos=None):
    ms = int((time.time() if timestamp is None else timestamp) * 1000) & ((1 << 48) - 1)
    rand = int.from_bytes(os.urandom(10), "big")
    value = (ms << 80) | (0x7 << 76) | ((rand >> 62) & 0xFFF) << 64 | (0b10 << 62) | (rand & ((1 << 62) - 1))
    return uuid.UUID(int=value)

UUID = uuid.UUID
uuid4 = uuid.uuid4
