"""Checkpoint compatibility across the LangChain reviver policy change."""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import asdict

import pytest
from langchain_core.load.dump import dumps
from langchain_core.messages import AIMessage
from langchain_core.prompts import PromptTemplate

from app.workflows.socratic_graph import SocraticGraphState


def test_cold_graph_import_has_no_pending_deprecation_warning() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-W", "error",
            "-c",
            "from app.workflows.socratic_graph import build_workflow; "
            "from app.ai.adapters import FakeAiAdapter; "
            "build_workflow(FakeAiAdapter())",
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert result.stderr == ""


@pytest.mark.parametrize("encoding", ["json", "msgpack"])
def test_socratic_checkpoint_state_round_trip(encoding: str) -> None:
    from app.workflows.langgraph_compat import jsonplus

    state = asdict(SocraticGraphState(
        session_id="s1",
        student_id="u1",
        assignment_revision_id="a1",
        current_outline={"thesis": "Ý chí vượt khó", "sections": []},
        chat_history=[{"role": "STUDENT", "content": "Em cần chỉnh dàn ý"}],
        context_chunks=[{"chunk_id": "chunk_1", "text": "Ngữ liệu"}],
    ))
    serde = jsonplus.JsonPlusSerializer()
    payload = (
        ("json", json.dumps(state, ensure_ascii=False).encode())
        if encoding == "json"
        else serde.dumps_typed(state)
    )
    assert serde.loads_typed(payload) == state


@pytest.mark.parametrize("legacy_object", [
    AIMessage(content="Em muốn chỉnh luận điểm nào?"),
    PromptTemplate.from_template("Ngữ liệu: {context}"),
])
def test_legacy_core_objects_still_load(legacy_object) -> None:
    from app.workflows.langgraph_compat import jsonplus

    payload = ("json", dumps(legacy_object).encode())
    assert jsonplus.JsonPlusSerializer().loads_typed(payload) == legacy_object
