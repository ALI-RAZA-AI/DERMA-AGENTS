"""xxhash stand-in (blake2b based; only hashing determinism is required)."""
import hashlib

class _H:
    def __init__(self, data=b"", seed=0, size=16):
        self._h = hashlib.blake2b(digest_size=size, salt=seed.to_bytes(8, "little").ljust(16, b"\0") if seed else b"")
        if data:
            self.update(data)
    def update(self, data):
        self._h.update(data.encode() if isinstance(data, str) else bytes(data)); return self
    def digest(self): return self._h.digest()
    def hexdigest(self): return self._h.hexdigest()
    def intdigest(self): return int.from_bytes(self._h.digest(), "big")

def xxh3_128(data=b"", seed=0): return _H(data, seed, 16)
def xxh3_64(data=b"", seed=0): return _H(data, seed, 8)
xxh128 = xxh3_128
xxh64 = xxh3_64
def xxh3_128_hexdigest(data, seed=0): return xxh3_128(data, seed).hexdigest()
def xxh3_128_digest(data, seed=0): return xxh3_128(data, seed).digest()
def xxh3_128_intdigest(data, seed=0): return xxh3_128(data, seed).intdigest()
def xxh3_64_hexdigest(data, seed=0): return xxh3_64(data, seed).hexdigest()
def xxh3_64_intdigest(data, seed=0): return xxh3_64(data, seed).intdigest()
def xxh64_hexdigest(data, seed=0): return xxh3_64(data, seed).hexdigest()
def xxh64_intdigest(data, seed=0): return xxh3_64(data, seed).intdigest()
def xxh128_hexdigest(data, seed=0): return xxh3_128(data, seed).hexdigest()
