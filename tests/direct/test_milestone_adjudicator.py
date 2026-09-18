import hashlib
import json
import os

import pytest

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

pytestmark = pytest.mark.skipif(
    os.environ.get("VERDICTGRAPH_MILESTONE_DIRECT_ROLE") != "adjudicator",
    reason="Milestone Adjudicator Direct tests run in their isolated process",
)

CONTRACT = os.environ.get(
    "VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT",
    "contracts/verdict_graph_milestone_adjudicator.py",
)
ADJUDICATOR_SOURCE_SHA256 = hashlib.sha256(open(CONTRACT, "rb").read()).hexdigest()
BASELINE = "Accepted baseline: publish one verified integration."
SUBMISSION = "Milestone submission: the verified integration is live."


def _success(result):
    from genlayer.py import calldata

    return bytes([0]) + calldata.encode(result)


def _review_context(*, acceptance=BASELINE, submission=SUBMISSION):
    return [
        1,
        1,
        "verdictgraph",
        "Integration milestone",
        "Publish one verified integration.",
        json.dumps([{"id": 1, "text": "The integration is live and verifiable."}]),
        "https://baseline.example/project.txt",
        hashlib.sha256(acceptance.encode()).hexdigest(),
        "https://baseline-mirror.example/project.txt",
        "https://acceptance.example/project.json",
        hashlib.sha256(acceptance.encode()).hexdigest(),
        "https://acceptance-mirror.example/project.json",
        1,
        "https://baseline.example/submission.txt",
        hashlib.sha256(submission.encode()).hexdigest(),
        0,
        "",
        hashlib.sha256(b"terms").hexdigest(),
        TEST_TIME_UNIX + 172_800,
    ]


def _context_json(*, acceptance=BASELINE, submission=SUBMISSION):
    return json.dumps(_review_context(acceptance=acceptance, submission=submission), separators=(",", ":"))


def _install_registry_hook(vm, *, acceptance=BASELINE, submission=SUBMISSION):
    calls = []
    context = _review_context(acceptance=acceptance, submission=submission)

    def hook(_active_vm, request):
        if "CallContract" not in request:
            return None
        data = request["CallContract"]
        calldata_obj = data.get("calldata", {})
        method = calldata_obj.get("method")
        calls.append((method, list(calldata_obj.get("args", []))))
        if method == "get_review_context":
            return _success(json.dumps(context, sort_keys=True, separators=(",", ":")))
        return None

    vm._gl_call_hook = hook
    return calls


def test_adjudicator_runs_validator_equivalence_and_caches_exact_request_result(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    adjudicator = direct_deploy(CONTRACT, to_hex(direct_owner), ADJUDICATOR_SOURCE_SHA256)
    calls = _install_registry_hook(direct_vm)
    posts = []

    def post_hook(active_vm, request):
        result = _install_registry_hook(active_vm)
        if "PostMessage" in request:
            data = request["PostMessage"]
            calldata_obj = data.get("calldata", {})
            posts.append((calldata_obj.get("method"), list(calldata_obj.get("args", []))))
            return {"ok": None}
        return active_vm._gl_call_hook(request)

    # Preserve the registry view behavior while recording the finalized callback.
    def hook(active_vm, request):
        if "CallContract" in request:
            data = request["CallContract"]
            calldata_obj = data.get("calldata", {})
            method = calldata_obj.get("method")
            calls.append((method, list(calldata_obj.get("args", []))))
            if method == "get_review_context":
                context = [
                    1, 1, "verdictgraph", "Integration milestone", "Publish one verified integration.",
                    json.dumps([{"id": 1, "text": "The integration is live and verifiable."}]),
                    "https://baseline.example/project.txt", hashlib.sha256(BASELINE.encode()).hexdigest(), "https://baseline-mirror.example/project.txt",
                    "https://acceptance.example/project.json", hashlib.sha256(BASELINE.encode()).hexdigest(), "https://acceptance-mirror.example/project.json",
                    1, "https://baseline.example/submission.txt", hashlib.sha256(SUBMISSION.encode()).hexdigest(), 0, "", hashlib.sha256(b"terms").hexdigest(), TEST_TIME_UNIX + 172_800,
                ]
                return _success(json.dumps(context, separators=(",", ":")))
        if "PostMessage" in request:
            data = request["PostMessage"]
            calldata_obj = data.get("calldata", {})
            posts.append((calldata_obj.get("method"), list(calldata_obj.get("args", []))))
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"baseline\.example/submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", json.dumps({"decision": "PASS", "failed_criterion_id": 0, "summary": "The integration is present and verifiable."}))

    direct_vm.sender = direct_owner
    adjudicator.review_milestone(1, 1, _context_json())
    assert int(adjudicator.get_review_count()) == 1
    assert adjudicator.get_review(1).decision == "PASS"
    assert any(method == "record_review" for method, _ in posts)
    assert not any(method == "get_review_context" for method, _ in calls)

    posts.clear()
    direct_vm.clear_mocks()
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"baseline\.example/submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", json.dumps({"decision": "FAIL", "failed_criterion_id": 1, "summary": "Changed result."}))
    adjudicator.review_milestone(1, 1, _context_json())
    assert int(adjudicator.get_review_count()) == 1
    assert len(posts) == 1


def test_adjudicator_persists_repair_result_when_hash_pinned_document_is_unavailable(
    direct_vm, direct_deploy, direct_owner
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    adjudicator = direct_deploy(CONTRACT, to_hex(direct_owner), ADJUDICATOR_SOURCE_SHA256)
    posts = []

    def hook(_active_vm, request):
        if "CallContract" in request:
            return _success(json.dumps([
                1, 1, "verdictgraph", "M", "O", json.dumps([{"id": 1, "text": "criterion"}]),
                "https://baseline.example/project.txt", hashlib.sha256(BASELINE.encode()).hexdigest(), "https://baseline-mirror.example/project.txt",
                "https://acceptance.example/project.json", hashlib.sha256(BASELINE.encode()).hexdigest(), "https://acceptance-mirror.example/project.json",
                1, "https://baseline.example/submission.txt", hashlib.sha256(SUBMISSION.encode()).hexdigest(), 0, "", hashlib.sha256(b"terms").hexdigest(), TEST_TIME_UNIX + 172_800,
            ], separators=(",", ":")))
        if "PostMessage" in request:
            calldata_obj = request["PostMessage"].get("calldata", {})
            posts.append(list(calldata_obj.get("args", [])))
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    direct_vm.sender = direct_owner
    adjudicator.review_milestone(1, 1, _context_json())
    assert int(adjudicator.get_review_count()) == 0
    assert len(posts) == 1
    assert posts[0][5] == "REPAIR_REQUIRED"
