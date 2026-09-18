import hashlib
import json
import os

import pytest

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

pytestmark = pytest.mark.skipif(
    os.environ.get("VERDICTGRAPH_MILESTONE_DIRECT_ROLE") != "registry",
    reason="Milestone Registry Direct tests run in their isolated process",
)

CONTRACT = os.environ.get(
    "VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT",
    "contracts/verdict_graph_milestone_registry.py",
)
REGISTRY_SOURCE_SHA256 = hashlib.sha256(open(CONTRACT, "rb").read()).hexdigest()
PROJECT_REF = "verdictgraph"
BASELINE_URI = "https://baseline.example/project.txt"
BASELINE_MIRROR_URI = "https://baseline-mirror.example/project.txt"
ACCEPTANCE_URI = "https://acceptance.example/project.json"
ACCEPTANCE_MIRROR_URI = "https://acceptance-mirror.example/project.json"


def _success(result):
    from genlayer.py import calldata

    return bytes([0]) + calldata.encode(result)


def _install_authority_and_downstream_hooks(vm, sponsor, adjudicator_address):
    calls = []
    accepted = {
        "version": 1,
        "project_ref": PROJECT_REF,
        "sponsor": to_hex(sponsor),
        "baseline_uri": BASELINE_URI,
        "baseline_sha256": hashlib.sha256(b"baseline").hexdigest(),
        "baseline_mirror_uri": BASELINE_MIRROR_URI,
        "acceptance_record_uri": ACCEPTANCE_URI,
        "acceptance_record_sha256": hashlib.sha256(b"acceptance").hexdigest(),
        "acceptance_record_mirror_uri": ACCEPTANCE_MIRROR_URI,
        "submission_origins_json": json.dumps([
            "https://acceptance-mirror.example",
            "https://acceptance.example",
            "https://baseline-mirror.example",
            "https://baseline.example",
        ], separators=(",", ":")),
        "registered_at": TEST_TIME_ISO,
    }

    def hook(active_vm, request):
        if "CallContract" in request:
            data = request["CallContract"]
            calldata_obj = data.get("calldata", {})
            method = calldata_obj.get("method")
            calls.append(("call", method, list(calldata_obj.get("args", []))))
            if method == "get_project_snapshot":
                return _success(json.dumps(accepted, sort_keys=True, separators=(",", ":")))
            if method == "get_acceptance_authority":
                from genlayer.py.types import Address

                return _success(Address(sponsor))
            if method == "registry_address":
                from genlayer.py.types import Address

                return _success(Address(active_vm._contract_address))
            return None
        if "PostMessage" in request:
            data = request["PostMessage"]
            calldata_obj = data.get("calldata", {})
            calls.append(("post", calldata_obj.get("method"), list(calldata_obj.get("args", []))))
            return {"ok": None}
        if "EthSend" in request:
            data = request["EthSend"]
            raw_calldata = bytes(data.get("calldata", b""))
            selectors = {"018b44f6": "register_milestone", "685baa4b": "apply_final_outcome", "6b6fa0af": "recover_active"}
            calls.append(("evm", selectors.get(raw_calldata[:4].hex(), raw_calldata[:4].hex()), raw_calldata))
            return {"ok": None}
        return None

    vm._gl_call_hook = hook
    return calls


def _create_milestone(registry, vm, owner, beneficiary):
    vm.sender = owner
    milestone_id = registry.create_milestone(
        "Integration milestone",
        "Publish one verified integration against the accepted baseline.",
        PROJECT_REF,
        json.dumps([{"id": 1, "text": "The integration is live and verifiable."}]),
        to_hex(beneficiary),
        1_000,
        200,
        TEST_TIME_UNIX + 3_600,
        TEST_TIME_UNIX + 86_400,
        TEST_TIME_UNIX + 172_800,
        3_600,
        f"milestone-{vm._contract_address.hex()}-{vm.sender.hex()}",
    )
    registry.activate_milestone(milestone_id)
    return milestone_id


def test_registry_owns_lifecycle_and_authenticates_finalized_adjudicator_callbacks(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    registry = direct_deploy(CONTRACT, to_hex(direct_alice), REGISTRY_SOURCE_SHA256)
    calls = _install_authority_and_downstream_hooks(direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_owner
    registry.bind_adjudicator(to_hex(direct_bob))
    registry.bind_vault(to_hex(direct_alice))
    milestone_id = _create_milestone(registry, direct_vm, direct_alice, direct_bob)
    registry.register_milestone_in_vault(milestone_id)
    assert any(call[1] == "register_milestone" for call in calls if call[0] == "evm")

    direct_vm.sender = direct_bob
    registry.submit_milestone(milestone_id, "https://baseline.example/submission.txt", hashlib.sha256(b"submission").hexdigest())
    direct_vm.sender = direct_alice
    registry.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    registry.mark_milestone_ready(milestone_id)
    registry.resolve_milestone(milestone_id)
    assert registry.get_milestone(milestone_id).status == "REVIEW_PENDING"
    assert any(call[1] == "review_milestone" for call in calls if call[0] == "post")

    source_set_sha256 = hashlib.sha256(b"source-set").hexdigest()
    payload = [int(milestone_id), 1, 0, "PASS", 0, 1, source_set_sha256]
    review_sha256 = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("E60"):
        registry.record_review(milestone_id, 1, 1, 1, 0, "OK", "PASS", 0, 1, source_set_sha256, "Pass.", review_sha256, "", "")

    direct_vm.sender = direct_bob
    registry.record_review(milestone_id, 1, 1, 1, 0, "OK", "PASS", 0, 1, source_set_sha256, "Pass.", review_sha256, "", "")
    assert registry.get_milestone(milestone_id).status == "REVIEWED"
    assert int(registry.get_milestone(milestone_id).latest_review_id) == 1


def test_registry_rejects_unbound_authority_snapshots_and_keeps_binding_one_shot(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    registry = direct_deploy(CONTRACT, to_hex(direct_alice), REGISTRY_SOURCE_SHA256)
    _install_authority_and_downstream_hooks(direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_owner
    registry.bind_adjudicator(to_hex(direct_bob))
    with direct_vm.expect_revert("E19"):
        registry.bind_adjudicator(to_hex(direct_alice))


def test_registry_restricts_escrow_registration_and_challenge_resolution_to_participants(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    registry = direct_deploy(CONTRACT, to_hex(direct_alice), REGISTRY_SOURCE_SHA256)
    _install_authority_and_downstream_hooks(direct_vm, direct_alice, direct_bob)
    registry.bind_adjudicator(to_hex(direct_bob))
    registry.bind_vault(to_hex(direct_alice))
    milestone_id = _create_milestone(registry, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("E42"):
        registry.register_milestone_in_vault(milestone_id)

    direct_vm.sender = direct_alice
    registry.register_milestone_in_vault(milestone_id)
    direct_vm.sender = direct_bob
    registry.submit_milestone(milestone_id, "https://baseline.example/submission.txt", hashlib.sha256(b"submission").hexdigest())
    direct_vm.sender = direct_alice
    registry.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    registry.mark_milestone_ready(milestone_id)
    registry.resolve_milestone(milestone_id)

    source_set_sha256 = hashlib.sha256(b"source-set").hexdigest()
    payload = [int(milestone_id), 1, 0, "PASS", 0, 1, source_set_sha256]
    review_sha256 = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    registry.record_review(milestone_id, 1, 1, 1, 0, "OK", "PASS", 0, 1, source_set_sha256, "Pass.", review_sha256, "", "")
    direct_vm.sender = direct_alice
    registry.challenge_milestone(milestone_id, "The evidence needs another look.")

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("E16"):
        registry.resolve_challenge(milestone_id)
