import os
import hashlib
import json

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

CONTRACT = os.environ.get("VERDICTGRAPH_CONTRACT", "contracts/verdict_graph_core.py")
PUBLISHER = "https://evidence.example/records/"
PUBLISHER_2 = "https://corroboration.example/records/"


def _bootstrap(contract, vm, owner, requester, provider, issuer):
    vm.sender = owner
    policy_id = contract.create_evidence_policy(
        "Evidence policy", 1, 86_400, 3_600, 2, 2, 3_600, 7_200, 86_400
    )
    contract.add_policy_issuer(policy_id, to_hex(owner))
    contract.add_policy_issuer(policy_id, to_hex(issuer))
    contract.add_policy_publisher(policy_id, PUBLISHER)
    contract.add_policy_publisher(policy_id, PUBLISHER_2)
    contract.seal_evidence_policy(policy_id)

    workflow_id = contract.create_workflow(
        "Grant pipeline", "Verify grant eligibility", policy_id, TEST_TIME_UNIX + 604_800
    )
    handoff_id = contract.add_handoff(
        workflow_id,
        to_hex(requester),
        to_hex(provider),
        "Verify deadlines",
        json.dumps([
            {
                "id": 7,
                "text": "Every listed grant deadline must be open at observation time.",
                "fault_class": "VERIFICATION_FAILURE",
                "consequence_rule_id": 2,
            }
        ]),
        1_000,
        200,
        TEST_TIME_UNIX + 3_600,
        TEST_TIME_UNIX + 172_800,
        TEST_TIME_UNIX + 259_200,
    )
    contract.activate_workflow(workflow_id)

    vm.sender = requester
    case_id = contract.open_case(workflow_id, handoff_id, "An expired grant was certified active")
    return policy_id, workflow_id, handoff_id, case_id


def _register(
    contract, vm, issuer, case_id,
    text="Grant deadline: 2026-08-30. Status: closed.",
    stable_id="grant-1-v1", publisher=PUBLISHER, group="grant-deadline"
):
    digest = hashlib.sha256(text.encode()).hexdigest()
    vm.sender = issuer
    evidence_id = contract.register_evidence(
        case_id,
        stable_id,
        publisher,
        publisher + stable_id + ".txt",
        digest,
        1,
        TEST_TIME_UNIX - 120,
        TEST_TIME_UNIX - 60,
        TEST_TIME_UNIX + 86_400,
        group,
    )
    return evidence_id, digest


def test_only_approved_issuer_can_register(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)

    direct_vm.sender = direct_alice
    text = "evidence"
    digest = hashlib.sha256(text.encode()).hexdigest()
    with direct_vm.expect_revert("issuer is not approved"):
        contract.register_evidence(
            case_id, "bad-issuer", PUBLISHER, PUBLISHER + "bad.txt", digest, 1,
            TEST_TIME_UNIX - 120, TEST_TIME_UNIX - 60, TEST_TIME_UNIX + 86_400, "g"
        )


def test_stable_evidence_id_cannot_be_reused(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    _register(contract, direct_vm, direct_charlie, case_id)

    with direct_vm.expect_revert("already been consumed"):
        _register(contract, direct_vm, direct_charlie, case_id)


def test_publisher_boundary_is_enforced(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    direct_vm.sender = direct_charlie
    digest = hashlib.sha256(b"x").hexdigest()

    with direct_vm.expect_revert("outside the approved publisher boundary"):
        contract.register_evidence(
            case_id, "wrong-host", PUBLISHER, "https://evil.example/record.txt", digest, 1,
            TEST_TIME_UNIX - 120, TEST_TIME_UNIX - 60, TEST_TIME_UNIX + 86_400, "g"
        )


def test_post_review_response_creates_fresh_revision(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    _register(contract, direct_vm, direct_charlie, case_id)
    corroboration_text = "Independent archive confirms the grant deadline was 2026-08-30 and is closed."
    _register(
        contract, direct_vm, direct_owner, case_id,
        text=corroboration_text,
        stable_id="grant-1-corroboration-v1", publisher=PUBLISHER_2
    )

    direct_vm.sender = direct_alice
    contract.mark_revision_ready(case_id)
    direct_vm.sender = direct_bob
    contract.mark_revision_ready(case_id)

    evidence_text = "Grant deadline: 2026-08-30. Status: closed."
    direct_vm.mock_web(r"evidence\.example/records/grant-1-v1\.txt", {"status": 200, "body": evidence_text})
    direct_vm.mock_web(r"corroboration\.example/records/grant-1-corroboration-v1\.txt", {"status": 200, "body": corroboration_text})
    direct_vm.mock_llm(r"VERDICTGRAPH_HANDOFF_REVIEW_V1", json.dumps({
        "decision": "BREACH",
        "violated_rule_id": 7,
        "summary": "The pinned evidence states that the deadline was already closed."
    }))
    verdict_id = contract.resolve_case(case_id)
    assert int(verdict_id) > 0
    assert contract.get_case(case_id).status == "REVIEWED"

    response = "Counter-evidence contests the observation date."
    response_hash = hashlib.sha256(response.encode()).hexdigest()
    direct_vm.sender = direct_bob
    revision_no = contract.begin_revision(
        case_id, "https://response.example/provider-r1.txt", response_hash
    )
    assert int(revision_no) == 2
    assert contract.get_case(case_id).status == "OPEN"
    assert int(contract.get_case(case_id).latest_verdict_id) == 0


def test_revision_requires_independent_corroboration_thresholds(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    _register(contract, direct_vm, direct_charlie, case_id)
    direct_vm.sender = direct_alice
    contract.mark_revision_ready(case_id)
    direct_vm.sender = direct_bob
    contract.mark_revision_ready(case_id)

    with direct_vm.expect_revert("required independent issuers"):
        contract.resolve_case(case_id)


def test_revision_rejects_mixed_corroboration_groups(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    _register(contract, direct_vm, direct_charlie, case_id, group="deadline-fact")

    with direct_vm.expect_revert("same registered fact group"):
        _register(
            contract,
            direct_vm,
            direct_owner,
            case_id,
            text="Independent source reports a different fact group.",
            stable_id="other-group-v1",
            publisher=PUBLISHER_2,
            group="different-fact",
        )


def test_corroboration_rejects_duplicate_content_digest(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, _, _, case_id = _bootstrap(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    duplicate_text = "Same record bytes cannot count twice as independent corroboration."
    _register(
        contract, direct_vm, direct_charlie, case_id,
        text=duplicate_text, stable_id="dup-primary-v1", publisher=PUBLISHER
    )
    with direct_vm.expect_revert("distinct content digests"):
        _register(
            contract, direct_vm, direct_owner, case_id,
            text=duplicate_text, stable_id="dup-copy-v1", publisher=PUBLISHER_2
        )
