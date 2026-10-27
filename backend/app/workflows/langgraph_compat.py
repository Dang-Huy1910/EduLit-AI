"""Keep LangGraph 0.6 / checkpoint 3.0 JSON loading policy explicit."""

from __future__ import annotations

import warnings

from langchain_core._api.deprecation import LangChainPendingDeprecationWarning
from langchain_core.load.load import Reviver

# checkpoint 3.0.1 constructs a module-level Reviver() during import and does
# not expose allowed_objects on JsonPlusSerializer. Ignore only that bootstrap
# warning, then replace the reviver before any graph or checkpoint is used.
with warnings.catch_warnings():
    warnings.filterwarnings(
        "ignore",
        message=r"The default value of `allowed_objects` will change.*",
        category=LangChainPendingDeprecationWarning,
    )
    from langgraph.checkpoint.serde import jsonplus

# Current Socratic channels contain plain JSON. Keep the previous 'core'
# allowlist so older JSON checkpoints with LangChain objects still load.
# Msgpack decoding and JSON constructor allowlists remain unchanged.
jsonplus.LC_REVIVER = Reviver(allowed_objects="core")

from langgraph.graph import END, StateGraph  # noqa: E402

__all__ = ["END", "StateGraph"]
