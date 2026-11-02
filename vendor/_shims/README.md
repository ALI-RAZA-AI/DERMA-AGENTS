# Offline-sandbox shims

The build sandbox for DermaAgents had no access to PyPI, so compiled (Rust/C)
dependencies of LangChain/LangGraph/LangSmith/Mesa could not be installed.
These modules are **minimal pure-Python stand-ins** that implement only the API
surface those libraries touch. They are put on `sys.path` *after* real
site-packages, so a normal `pip install -r requirements.txt` environment always
uses the real packages and ignores these files.
