import os
import hashlib
import json

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

CONTRACT = os.environ.get("VERDICTGRAPH_CONTRACT", "contracts/verdict_graph_core.py")
PUBLISHER = "https://evidence.example/"
PUBLISHER_2 = "https://corroboration.example/"
TEXT = "Official record: application deadline 2026-08-30. The program is closed."
TEXT_2 = "Independent archive confirms the 2026-08-30 deadline has closed."


def _ready_case(contract, vm, owner, requester, provider, issuer):
    vm.sender = owner
    policy_id = contract.create_evidence_policy(
        "P", 1, 86_400, 300, 2, 2, 3_600, 7_200, 86_400
    )
    contract.add_policy_issuer(policy_id, to_hex(owner))
    contract.add_policy_issuer(policy_id, to_hex(issuer))
    contract.add_policy_publisher(policy_id, PUBLISHER)
    contract.add_policy_publisher(policy_id, PUBLISHER_2)
    contract.seal_evidence_policy(policy_id)
    workflow_id = contract.create_workflow("W", "M", policy_id, TEST_TIME_UNIX + 604_800)
    handoff_id = contract.add_handoff(
        workflow_id, to_hex(requester), to_hex(provider), "Verify open deadlines",
        json.dumps([{
            "id": 1,
            "text": "Do not certify a grant whose deadline is closed.",
            "fault_class": "VERIFICATION_FAILURE",
            "consequence_rule_id": 2,
        }]),
        1_000, 200,
        TEST_TIME_UNIX + 3_600,
        TEST_TIME_UNIX + 86_400,
        TEST_TIME_UNIX + 172_800,
    )
    contract.activate_workflow(workflow_id)
    vm.sender = requester
    case_id = contract.open_case(workflow_id, handoff_id, "Expired grant certified active")
    vm.sender = issuer
    contract.register_evidence(
        case_id, "official-grant-2026-v1", PUBLISHER, PUBLISHER + "grant.txt",
        hashlib.sha256(TEXT.encode()).hexdigest(), 1,
        TEST_TIME_UNIX - 120, TEST_TIME_UNIX - 60, TEST_TIME_UNIX + 86_400, "official"
    )
    vm.sender = owner
    contract.register_evidence(
        case_id, "official-grant-2026-corroboration-v1", PUBLISHER_2,
        PUBLISHER_2 + "grant.txt", hashlib.sha256(TEXT_2.encode()).hexdigest(), 1,
        TEST_TIME_UNIX - 120, TEST_TIME_UNIX - 60, TEST_TIME_UNIX + 86_400, "official"
    )
    vm.sender = requester
    contract.mark_revision_ready(case_id)
    vm.sender = provider
    contract.mark_revision_ready(case_id)
    return case_id


def test_validator_rederives_same_consequential_fields(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _ready_case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)

    result = json.dumps({
        "decision": "BREACH",
        "violated_rule_id": 1,
        "summary": "The authoritative record shows the deadline was already closed."
    })
    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": TEXT})
    direct_vm.mock_web(r"corroboration\.example/grant\.txt", {"status": 200, "body": TEXT_2})
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", result)
    contract.resolve_case(case_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": TEXT})
    direct_vm.mock_web(r"corroboration\.example/grant\.txt", {"status": 200, "body": TEXT_2})
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", result)
    assert direct_vm.run_validator() is True


def test_validator_rejects_contradictory_breach_outcome(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _ready_case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)

    leader = json.dumps({
        "decision": "BREACH", "violated_rule_id": 1,
        "summary": "Closed deadline violates the registered criterion."
    })
    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": TEXT})
    direct_vm.mock_web(r"corroboration\.example/grant\.txt", {"status": 200, "body": TEXT_2})
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", leader)
    contract.resolve_case(case_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": TEXT})
    direct_vm.mock_web(r"corroboration\.example/grant\.txt", {"status": 200, "body": TEXT_2})
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", json.dumps({
        "decision": "NO_BREACH", "violated_rule_id": 0,
        "summary": "No breach."
    }))
    assert direct_vm.run_validator() is False


def test_hash_mismatch_persists_repairable_state(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _ready_case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)

    direct_vm.mock_web(r"evidence\.example/grant\.txt", {"status": 200, "body": "tampered bytes"})
    result = contract.resolve_case(case_id)
    assert int(result) == 0
    assert contract.get_case(case_id).status == "REPAIR_REQUIRED"
    assert contract.get_revision(case_id, 1).status == "REPAIR_REQUIRED"
