import hashlib
import json
import os

import pytest

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

pytestmark = pytest.mark.skipif(
    os.environ.get("VERDICTGRAPH_SPLIT_DIRECT_ROLE") != "adjudicator",
    reason="Adjudicator split Direct tests run in their isolated Stage 4E process",
)

ADJUDICATOR = "contracts/verdict_graph_adjudicator_deploy.py"
P1 = "https://evidence.example/"
P2 = "https://corroboration.example/"
T1 = "Official record: deadline closed."
T2 = "Independent corroboration: deadline closed."


def _success(result):
    from genlayer.py import calldata

    return bytes([0]) + calldata.encode(result)


def _case_context(case_id, opener, requester, provider):
    return {
        "case_id": int(case_id),
        "workflow_id": 1,
        "handoff_id": 1,
        "opener": to_hex(opener),
        "claim": "Closed deadline certified active",
        "policy_id": 1,
        "policy_fingerprint_sha256": hashlib.sha256(b"policy-v1").hexdigest(),
        "max_evidence_age_seconds": 86_400,
        "minimum_remaining_validity_seconds": 300,
        "minimum_distinct_issuers": 2,
        "minimum_distinct_publishers": 2,
        "response_window_seconds": 3_600,
        "repair_window_seconds": 7_200,
        "review_recovery_seconds": 86_400,
        "workflow_title": "W",
        "workflow_mission": "M",
        "requester": to_hex(requester),
        "provider": to_hex(provider),
        "responsibility": "Verify deadline",
        "criteria_json": json.dumps(
            [
                {
                    "id": 1,
                    "text": "Do not certify a closed deadline.",
                    "fault_class": "VERIFICATION_FAILURE",
                    "consequence_rule_id": 2,
                }
            ]
        ),
        "handoff_deadline": TEST_TIME_UNIX + 3600,
        "handoff_recovery_deadline": TEST_TIME_UNIX + 172800,
        "response_deadline": TEST_TIME_UNIX + 3600,
        "recovery_deadline": TEST_TIME_UNIX + 86_400,
        "opened_at": TEST_TIME_ISO,
    }


def _install_registry_boundary_hook(
    vm,
    context,
    *,
    issuer_allowed=True,
    publisher_allowed=True,
    delivery=None,
):
    calls = []
    delivery = delivery or {
        "handoff_id": 1,
        "version": 0,
        "uri": "",
        "sha256": "",
        "submitted_at": 0,
        "deadline": TEST_TIME_UNIX + 3600,
    }

    def hook(_active_vm, request):
        if "CallContract" not in request:
            return None
        data = request["CallContract"]
        calldata_obj = data.get("calldata", {})
        method = calldata_obj.get("method")
        calls.append((data.get("address"), method, list(calldata_obj.get("args", []))))
        if method == "get_case_context":
            return _success(json.dumps(context, sort_keys=True, separators=(",", ":")))
        if method == "is_policy_issuer":
            return _success(bool(issuer_allowed))
        if method == "is_policy_publisher":
            return _success(bool(publisher_allowed))
        if method == "get_delivery_snapshot":
            return _success(json.dumps(delivery, sort_keys=True, separators=(",", ":")))
        return None

    vm._gl_call_hook = hook
    return calls


def _deploy_and_initialize(
    direct_vm,
    direct_deploy,
    deployer,
    registry,
    requester,
    provider,
    *,
    issuer_allowed=True,
    publisher_allowed=True,
):
    direct_vm.sender = deployer
    adjudicator = direct_deploy(ADJUDICATOR, to_hex(registry))
    context = _case_context(1, requester, requester, provider)
    calls = _install_registry_boundary_hook(
        direct_vm,
        context,
        issuer_allowed=issuer_allowed,
        publisher_allowed=publisher_allowed,
    )
    direct_vm.sender = registry
    adjudicator.initialize_case(1)
    return adjudicator, context, calls


def test_split_binding_and_finalized_case_receiver(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    adjudicator, _, calls = _deploy_and_initialize(
        direct_vm,
        direct_deploy,
        direct_charlie,
        direct_owner,
        direct_alice,
        direct_bob,
    )

    case = adjudicator.get_case(1)
    assert int(case.handoff_id) == 1
    assert to_hex(adjudicator.registry_address()) == to_hex(direct_owner)
    assert any(method == "get_case_context" for _, method, _ in calls)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the bound registry can initialize cases"):
        adjudicator.initialize_case(2)


def test_split_evidence_authority_is_registry_bound(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    adjudicator, _, calls = _deploy_and_initialize(
        direct_vm,
        direct_deploy,
        direct_charlie,
        direct_owner,
        direct_alice,
        direct_bob,
        issuer_allowed=False,
    )

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Evidence issuer is not approved by the bound policy"):
        adjudicator.register_evidence(
            1,
            "bad",
            P1,
            P1 + "bad.txt",
            hashlib.sha256(b"x").hexdigest(),
            1,
            TEST_TIME_UNIX - 120,
            TEST_TIME_UNIX - 60,
            TEST_TIME_UNIX + 86_400,
            "official",
        )
    assert any(method == "is_policy_issuer" for _, method, _ in calls)


def test_split_validator_rederives_exact_consequence(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    adjudicator, _, calls = _deploy_and_initialize(
        direct_vm,
        direct_deploy,
        direct_charlie,
        direct_owner,
        direct_alice,
        direct_bob,
        issuer_allowed=True,
        publisher_allowed=True,
    )

    direct_vm.sender = direct_charlie
    adjudicator.register_evidence(
        1,
        "official-v1",
        P1,
        P1 + "grant.txt",
        hashlib.sha256(T1.encode()).hexdigest(),
        1,
        TEST_TIME_UNIX - 120,
        TEST_TIME_UNIX - 60,
        TEST_TIME_UNIX + 86_400,
        "official",
    )
    direct_vm.sender = direct_owner
    adjudicator.register_evidence(
        1,
        "corroboration-v1",
        P2,
        P2 + "grant.txt",
        hashlib.sha256(T2.encode()).hexdigest(),
        1,
        TEST_TIME_UNIX - 120,
        TEST_TIME_UNIX - 60,
        TEST_TIME_UNIX + 86_400,
        "official",
    )

    direct_vm.sender = direct_alice
    adjudicator.mark_revision_ready(1)
    direct_vm.sender = direct_bob
    adjudicator.mark_revision_ready(1)

    model = json.dumps(
        {"decision": "BREACH", "violated_rule_id": 1, "summary": "Closed deadline."}
    )
    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": T1})
    direct_vm.mock_web(
        r"corroboration\.example/grant\.txt", {"status": 200, "body": T2}
    )
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", model)

    verdict_id = adjudicator.resolve_case(1)
    assert int(verdict_id) > 0
    assert int(adjudicator.get_verdict(verdict_id).consequence_rule_id) == 2
    assert any(method == "get_delivery_snapshot" for _, method, _ in calls)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": T1})
    direct_vm.mock_web(
        r"corroboration\.example/grant\.txt", {"status": 200, "body": T2}
    )
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", model)
    assert direct_vm.run_validator() is True
