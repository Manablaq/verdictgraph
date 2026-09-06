import hashlib
import json
import os

import pytest

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

pytestmark = pytest.mark.skipif(
    os.environ.get("VERDICTGRAPH_SPLIT_DIRECT_ROLE") != "registry",
    reason="Registry split Direct tests run in their isolated Stage 4E process",
)

REGISTRY = "contracts/verdict_graph_registry_deploy.py"
P1 = "https://evidence.example/"
P2 = "https://corroboration.example/"
DELIVERY = b"provider-delivery-v1"
INDEPENDENT_ISSUER = bytes.fromhex("11" * 20)


def _success(result):
    # Import only while a Direct contract is active; the pinned runner injects
    # the GenLayer SDK dynamically rather than exposing it as a normal pytest import.
    from genlayer.py import calldata

    return bytes([0]) + calldata.encode(result)


def _install_adjudicator_boundary_hook(vm):
    calls = []
    posts = []

    def hook(active_vm, request):
        if "CallContract" in request:
            data = request["CallContract"]
            method = data.get("calldata", {}).get("method")
            calls.append((data.get("address"), method))
            if method == "registry_address":
                from genlayer.py.types import Address

                return _success(Address(active_vm._contract_address))
            return None
        if "PostMessage" in request:
            data = request["PostMessage"]
            calldata_obj = data.get("calldata", {})
            posts.append(
                {
                    "address": data.get("address"),
                    "method": calldata_obj.get("method"),
                    "args": list(calldata_obj.get("args", [])),
                }
            )
            return {"ok": None}
        return None

    vm._gl_call_hook = hook
    return calls, posts


def _build_disputed_handoff(registry, vm, owner, requester, provider, issuer, adjudicator_address):
    calls, posts = _install_adjudicator_boundary_hook(vm)
    vm.sender = owner
    registry.bind_adjudicator(to_hex(adjudicator_address))

    policy = registry.create_evidence_policy("P", 1, 86_400, 300, 2, 2, 3_600, 7_200, 86_400)
    registry.add_policy_issuer(policy, to_hex(owner))
    registry.add_policy_issuer(policy, to_hex(issuer))
    registry.add_policy_publisher(policy, P1)
    registry.add_policy_publisher(policy, P2)
    registry.seal_evidence_policy(policy)

    workflow = registry.create_workflow("W", "M", policy, TEST_TIME_UNIX + 604_800)
    handoff = registry.add_handoff(
        workflow,
        to_hex(requester),
        to_hex(provider),
        "Verify deadline",
        json.dumps(
            [
                {
                    "id": 1,
                    "text": "Do not certify a closed deadline.",
                    "fault_class": "VERIFICATION_FAILURE",
                    "consequence_rule_id": 2,
                }
            ]
        ),
        1000,
        200,
        TEST_TIME_UNIX + 3600,
        TEST_TIME_UNIX + 86400,
        TEST_TIME_UNIX + 172800,
    )
    registry.activate_workflow(workflow)

    vm.sender = provider
    registry.submit_handoff_delivery(
        handoff,
        "https://delivery.example/provider.txt",
        hashlib.sha256(DELIVERY).hexdigest(),
    )

    vm.sender = requester
    case_id = registry.open_case(workflow, handoff, "Closed deadline certified active")
    return handoff, case_id, calls, posts


def test_split_vault_binding_is_one_shot_without_ethcall(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    registry = direct_deploy(REGISTRY)

    # Registry intentionally requires its Adjudicator to be bound first.
    # The existing Direct boundary hook supplies the Adjudicator's
    # registry_address() response without introducing any EVM Vault EthCall.
    calls, _ = _install_adjudicator_boundary_hook(direct_vm)
    registry.bind_adjudicator(to_hex(direct_alice))

    assert any(method == "registry_address" for _, method in calls)

    registry.bind_vault(to_hex(direct_bob))
    assert to_hex(registry.get_vault_address()) == to_hex(direct_bob)

    with direct_vm.expect_revert("Vault is already bound"):
        registry.bind_vault(to_hex(direct_owner))


def test_split_dispute_lock_blocks_direct_acceptance(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    registry = direct_deploy(REGISTRY)
    handoff, case_id, calls, posts = _build_disputed_handoff(
        registry,
        direct_vm,
        direct_owner,
        direct_alice,
        direct_bob,
        INDEPENDENT_ISSUER,
        direct_charlie,
    )

    assert registry.get_handoff_case_id(handoff) == case_id
    assert any(method == "registry_address" for _, method in calls)
    assert len(posts) == 1
    assert posts[0]["method"] == "initialize_case"
    assert int(posts[0]["args"][0]) == int(case_id)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Disputed handoff cannot be accepted directly"):
        registry.accept_handoff_delivery(handoff)


def test_split_case_initialization_retry_is_idempotent(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    registry = direct_deploy(REGISTRY)
    _, case_id, _, posts = _build_disputed_handoff(
        registry,
        direct_vm,
        direct_owner,
        direct_alice,
        direct_bob,
        INDEPENDENT_ISSUER,
        direct_charlie,
    )

    direct_vm.sender = direct_alice
    registry.retry_case_initialization(case_id)
    assert [p["method"] for p in posts] == ["initialize_case", "initialize_case"]
    assert [int(p["args"][0]) for p in posts] == [int(case_id), int(case_id)]

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only a case participant can retry initialization"):
        registry.retry_case_initialization(case_id)
