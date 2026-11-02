"""langchain-protocol stand-in: the real package only defines TypedDict/Literal
type declarations for LangChain's streaming protocol; at runtime they behave as dicts."""
from typing import Any
def __getattr__(name: str) -> Any:
    return dict
