class Doc:
    """Minimal annotated_doc.Doc (PEP 727 style documentation marker)."""
    def __init__(self, documentation: str, /) -> None:
        self.documentation = documentation
    def __repr__(self) -> str:
        return f"Doc({self.documentation!r})"
    def __hash__(self): return hash(self.documentation)
    def __eq__(self, other): return isinstance(other, Doc) and other.documentation == self.documentation
