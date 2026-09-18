import hashlib
import json
import os
from pathlib import Path

import pytest

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

pytestmark = pytest.mark.skipif(
    os.environ.get("VERDICTGRAPH_MILESTONE_DIRECT_ROLE") != "milestone",
    reason="Milestone Direct tests run in their isolated process",
)

CONTRACT = os.environ.get(
    "VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT",
    "contracts/verdict_graph_milestone.py",
)
CONTROLLER_SOURCE_SHA256 = hashlib.sha256(Path(CONTRACT).read_bytes()).hexdigest()
BASELINE_URI = "https://baseline.example/project.txt"
SUBMISSION_URI = "https://baseline.example/project-submission.txt"
BASELINE_MIRROR_URI = "https://baseline-mirror.example/project.txt"
ACCEPTANCE_URI = "https://acceptance.example/project.json"
ACCEPTANCE_MIRROR_URI = "https://acceptance-mirror.example/project.json"
PROJECT_REF = "verdictgraph"
BASELINE = "Accepted baseline: publish one verified integration."
SUBMISSION = "Milestone submission: the verified integration is live."
ACCEPTANCE = "Accepted project: VerdictGraph milestone release."
AFTER_CHALLENGE_WINDOW_ISO = "2026-09-07T12:00:00+00:00"
AFTER_RECOVERY_DEADLINE_ISO = "2026-09-10T12:00:00+00:00"


def _success(result):
    from genlayer.py import calldata

    return bytes([0]) + calldata.encode(result)


def _install_vault_hook(vm, *, status=3):
    calls = []

    def hook(active_vm, request):
        if "CallContract" in request or "EthCall" in request:
            data = request.get("CallContract") or request["EthCall"]
            calldata_obj = data.get("calldata", {})
            method = calldata_obj.get("method")
            calls.append(("call", method, list(calldata_obj.get("args", []))))
            if method == "milestone_core":
                from genlayer.py.types import Address

                return _success(Address(active_vm._contract_address))
            if method == "milestone_status":
                return _success(status)
            return None
        if "PostMessage" in request:
            data = request["PostMessage"]
            calldata_obj = data.get("calldata", {})
            calls.append(("post", calldata_obj.get("method"), list(calldata_obj.get("args", []))))
            return {"ok": None}
        if "EthSend" in request:
            data = request["EthSend"]
            raw_calldata = bytes(data.get("calldata", b""))
            selectors = {
                "018b44f6": "register_milestone",
                "685baa4b": "apply_final_outcome",
                "6b6fa0af": "recover_active",
            }
            calls.append(("post", selectors.get(raw_calldata[:4].hex(), raw_calldata[:4].hex()), raw_calldata))
            return {"ok": None}
        return None

    vm._gl_call_hook = hook
    return calls


def _create(controller, vm, owner, beneficiary):
    vm.sender = owner
    milestone_reference = f"milestone-{vm._contract_address.hex()}-{vm.sender.hex()}"
    milestone_id = controller.create_milestone(
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
        milestone_reference,
    )
    controller.activate_milestone(milestone_id)
    return milestone_id


def test_milestone_terms_are_immutable_and_vault_registration_is_finality_only(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(
        PROJECT_REF,
        to_hex(direct_owner),
        BASELINE_URI,
        hashlib.sha256(BASELINE.encode()).hexdigest(),
        BASELINE_MIRROR_URI,
        ACCEPTANCE_URI,
        hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
        ACCEPTANCE_MIRROR_URI,
    )
    calls = _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)

    direct_vm.sender = direct_owner
    controller.bind_vault(to_hex(direct_alice))
    direct_vm.sender = direct_alice
    controller.register_milestone_in_vault(milestone_id)

    assert len(controller.get_milestone(milestone_id).terms_sha256) == 64
    posts = [call for call in calls if call[0] == "post"]
    assert len(posts) == 1
    assert posts[0][1] == "register_milestone"
    assert len(posts[0][2]) > 4

    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("Milestone Vault is already bound"):
        controller.bind_vault(to_hex(direct_bob))


def test_submission_is_hash_pinned_and_consensus_binds_exact_outcome(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(PROJECT_REF, to_hex(direct_owner), BASELINE_URI, hashlib.sha256(BASELINE.encode()).hexdigest(), BASELINE_MIRROR_URI, ACCEPTANCE_URI, hashlib.sha256(ACCEPTANCE.encode()).hexdigest(), ACCEPTANCE_MIRROR_URI)
    calls = _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)

    direct_vm.sender = direct_owner
    controller.bind_vault(to_hex(direct_alice))

    direct_vm.sender = direct_bob
    version = controller.submit_milestone(
        milestone_id,
        SUBMISSION_URI,
        hashlib.sha256(SUBMISSION.encode()).hexdigest(),
    )
    assert int(version) == 1

    direct_vm.sender = direct_owner
    controller.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    controller.mark_milestone_ready(milestone_id)

    model = json.dumps({"decision": "PASS", "failed_criterion_id": 0, "summary": "The integration is present and verifiable."})
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", model)
    review_id = controller.resolve_milestone(milestone_id)
    assert int(review_id) > 0
    review = controller.get_review(review_id)
    assert review.decision == "PASS"
    assert int(review.consequence_rule_id) == 1
    assert len(review.review_sha256) == 64

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", model)
    assert direct_vm.run_validator() is True

    direct_vm.warp(AFTER_CHALLENGE_WINDOW_ISO)
    direct_vm.sender = direct_alice
    controller.queue_settlement(milestone_id, review_id)
    assert any(call[1] == "apply_final_outcome" for call in calls if call[0] == "post")


def test_validator_rejects_different_milestone_outcome(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(PROJECT_REF, to_hex(direct_owner), BASELINE_URI, hashlib.sha256(BASELINE.encode()).hexdigest(), BASELINE_MIRROR_URI, ACCEPTANCE_URI, hashlib.sha256(ACCEPTANCE.encode()).hexdigest(), ACCEPTANCE_MIRROR_URI)
    _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    direct_vm.sender = direct_owner
    controller.bind_vault(to_hex(direct_alice))
    direct_vm.sender = direct_bob
    controller.submit_milestone(milestone_id, SUBMISSION_URI, hashlib.sha256(SUBMISSION.encode()).hexdigest())
    direct_vm.sender = direct_owner
    controller.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    controller.mark_milestone_ready(milestone_id)

    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", json.dumps({"decision": "PASS", "failed_criterion_id": 0, "summary": "Pass."}))
    controller.resolve_milestone(milestone_id)

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", json.dumps({"decision": "FAIL", "failed_criterion_id": 1, "summary": "Fail."}))
    assert direct_vm.run_validator() is False


def test_bounded_challenge_reopens_review_and_binds_challenge_count(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(PROJECT_REF, to_hex(direct_owner), BASELINE_URI, hashlib.sha256(BASELINE.encode()).hexdigest(), BASELINE_MIRROR_URI, ACCEPTANCE_URI, hashlib.sha256(ACCEPTANCE.encode()).hexdigest(), ACCEPTANCE_MIRROR_URI)
    _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    direct_vm.sender = direct_owner
    controller.bind_vault(to_hex(direct_alice))
    direct_vm.sender = direct_bob
    controller.submit_milestone(
        milestone_id,
        SUBMISSION_URI,
        hashlib.sha256(SUBMISSION.encode()).hexdigest(),
    )
    direct_vm.sender = direct_owner
    controller.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    controller.mark_milestone_ready(milestone_id)

    model = json.dumps({"decision": "PASS", "failed_criterion_id": 0, "summary": "Pass."})
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", model)
    first_review_id = controller.resolve_milestone(milestone_id)
    assert int(first_review_id) == 1

    direct_vm.sender = direct_owner
    controller.challenge_milestone(milestone_id, "The evidence needs an additional production verification link.")
    challenged = controller.get_milestone(milestone_id)
    assert challenged.status == "CHALLENGED"
    assert challenged.challenged_by.as_hex.lower() == to_hex(direct_owner)
    assert int(challenged.challenged_at) > 0

    direct_vm.clear_mocks()
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", model)
    second_review_id = controller.resolve_challenge(milestone_id)
    review = controller.get_review(second_review_id)
    milestone = controller.get_milestone(milestone_id)
    assert int(second_review_id) == 2
    assert int(review.challenge_count) == 1
    assert int(milestone.challenge_count) == 1
    assert milestone.status == "REVIEWED"


def test_fetch_hash_failure_is_persisted_and_repair_can_submit_new_version(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(PROJECT_REF, to_hex(direct_owner), BASELINE_URI, hashlib.sha256(BASELINE.encode()).hexdigest(), BASELINE_MIRROR_URI, ACCEPTANCE_URI, hashlib.sha256(ACCEPTANCE.encode()).hexdigest(), ACCEPTANCE_MIRROR_URI)
    _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    direct_vm.sender = direct_owner
    controller.bind_vault(to_hex(direct_alice))
    direct_vm.sender = direct_bob
    controller.submit_milestone(milestone_id, SUBMISSION_URI, hashlib.sha256(SUBMISSION.encode()).hexdigest())
    direct_vm.sender = direct_owner
    controller.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    controller.mark_milestone_ready(milestone_id)

    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": "tampered baseline"})
    direct_vm.mock_web(r"baseline-mirror\.example/project\.txt", {"status": 200, "body": "tampered baseline"})
    assert int(controller.resolve_milestone(milestone_id)) == 0
    milestone = controller.get_milestone(milestone_id)
    assert milestone.status == "REPAIR_REQUIRED"
    assert milestone.repair_failure_code == "BASELINE_ALL_SOURCES_FAILED"
    assert milestone.repair_observed_sha256 == hashlib.sha256(b"tampered baseline").hexdigest()

    direct_vm.sender = direct_bob
    version = controller.submit_milestone(
        milestone_id,
        SUBMISSION_URI + "?v=2",
        hashlib.sha256(SUBMISSION.encode()).hexdigest(),
    )
    assert int(version) == 2


def test_authority_mirror_recovers_a_primary_baseline_outage(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(PROJECT_REF, to_hex(direct_owner), BASELINE_URI, hashlib.sha256(BASELINE.encode()).hexdigest(), BASELINE_MIRROR_URI, ACCEPTANCE_URI, hashlib.sha256(ACCEPTANCE.encode()).hexdigest(), ACCEPTANCE_MIRROR_URI)
    _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    direct_vm.sender = direct_bob
    controller.submit_milestone(milestone_id, SUBMISSION_URI, hashlib.sha256(SUBMISSION.encode()).hexdigest())
    direct_vm.sender = direct_owner
    controller.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    controller.mark_milestone_ready(milestone_id)

    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 503, "body": ""})
    direct_vm.mock_web(r"baseline-mirror\.example/project\.txt", {"status": 200, "body": BASELINE})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": SUBMISSION})
    direct_vm.mock_llm(r"VERDICTGRAPH_MILESTONE_REVIEW_V2", json.dumps({"decision": "PASS", "failed_criterion_id": 0, "summary": "Recovered from the primary baseline outage using the pinned mirror."}))
    review_id = controller.resolve_milestone(milestone_id)
    assert int(review_id) == 1
    assert controller.get_milestone(milestone_id).status == "REVIEWED"


def test_recovery_uses_vault_recovery_after_the_deadline(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    controller.register_accepted_project(
        PROJECT_REF,
        to_hex(direct_owner),
        BASELINE_URI,
        hashlib.sha256(BASELINE.encode()).hexdigest(),
        BASELINE_MIRROR_URI,
        ACCEPTANCE_URI,
        hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
        ACCEPTANCE_MIRROR_URI,
    )
    calls = _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    direct_vm.sender = direct_owner
    controller.bind_vault(to_hex(direct_alice))
    direct_vm.sender = direct_alice
    controller.register_milestone_in_vault(milestone_id)

    direct_vm.warp(AFTER_RECOVERY_DEADLINE_ISO)
    controller.recover_milestone(milestone_id)
    recovery_posts = [call for call in calls if call[0] == "post" and call[1] == "recover_active"]
    assert len(recovery_posts) == 1
    assert recovery_posts[0][2][:4].hex() == "6b6fa0af"


def test_acceptance_authority_and_milestone_reference_are_enforced(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)

    with direct_vm.expect_revert("Only the acceptance authority can register a project"):
        controller.register_accepted_project(
            PROJECT_REF,
            to_hex(direct_owner),
            BASELINE_URI,
            hashlib.sha256(BASELINE.encode()).hexdigest(),
            BASELINE_MIRROR_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Accepted baseline URI must use a public HTTPS origin"):
        controller.register_accepted_project(
            PROJECT_REF,
            to_hex(direct_owner),
            "https://127.0.0.1/project.txt",
            hashlib.sha256(BASELINE.encode()).hexdigest(),
            BASELINE_MIRROR_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )
    with direct_vm.expect_revert("Accepted baseline SHA-256 must be 64 lowercase hexadecimal characters"):
        controller.register_accepted_project(
            PROJECT_REF,
            to_hex(direct_owner),
            BASELINE_URI,
            hashlib.sha256(BASELINE.encode()).hexdigest().upper(),
            BASELINE_MIRROR_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )
    controller.register_accepted_project(
        PROJECT_REF,
        to_hex(direct_owner),
        BASELINE_URI,
        hashlib.sha256(BASELINE.encode()).hexdigest(),
        BASELINE_MIRROR_URI,
        ACCEPTANCE_URI,
        hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
        ACCEPTANCE_MIRROR_URI,
    )
    accepted = controller.get_accepted_project(PROJECT_REF)
    assert accepted.project_ref == PROJECT_REF
    assert accepted.acceptance_record_sha256 == hashlib.sha256(ACCEPTANCE.encode()).hexdigest()
    assert controller.get_controller_source_sha256() == CONTROLLER_SOURCE_SHA256

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the registered project sponsor can create milestones"):
        controller.create_milestone(
            "Unauthorized milestone",
            "A non-sponsor must not be able to create a milestone for an accepted project.",
            PROJECT_REF,
            json.dumps([{"id": 1, "text": "The integration is live and verifiable."}]),
            to_hex(direct_bob),
            1_000,
            200,
            TEST_TIME_UNIX + 3_600,
            TEST_TIME_UNIX + 86_400,
            TEST_TIME_UNIX + 172_800,
            3_600,
            "unauthorized-milestone",
        )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Accepted project reference is already registered"):
        controller.register_accepted_project(
            PROJECT_REF,
            to_hex(direct_owner),
            BASELINE_URI,
            hashlib.sha256(BASELINE.encode()).hexdigest(),
            BASELINE_MIRROR_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )

    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    milestone = controller.get_milestone(milestone_id)
    assert milestone.project_ref == PROJECT_REF
    assert int(controller.get_milestone_for_reference(milestone.reference)) == int(milestone_id)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Submission URI origin is not an authority-registered evidence origin"):
        controller.submit_milestone(milestone_id, "https://unregistered.example/result.txt", hashlib.sha256(SUBMISSION.encode()).hexdigest())

    with direct_vm.expect_revert("Milestone reference is already used"):
        direct_vm.sender = direct_owner
        controller.create_milestone(
            "Duplicate reference",
            "This must not overwrite the existing lookup.",
            PROJECT_REF,
            json.dumps([{"id": 1, "text": "The integration is live and verifiable."}]),
            to_hex(direct_bob),
            1_000,
            200,
            TEST_TIME_UNIX + 3_600,
            TEST_TIME_UNIX + 86_400,
            TEST_TIME_UNIX + 172_800,
            3_600,
            milestone.reference,
        )


def test_review_input_budget_persists_repair_state(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    controller = direct_deploy(CONTRACT, to_hex(direct_alice), CONTROLLER_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    large_baseline = "y" * 18_000
    controller.register_accepted_project(
        PROJECT_REF,
        to_hex(direct_owner),
        BASELINE_URI,
        hashlib.sha256(large_baseline.encode()).hexdigest(),
        BASELINE_MIRROR_URI,
        ACCEPTANCE_URI,
        hashlib.sha256(ACCEPTANCE.encode()).hexdigest(),
        ACCEPTANCE_MIRROR_URI,
    )
    _install_vault_hook(direct_vm)
    milestone_id = _create(controller, direct_vm, direct_owner, direct_bob)
    direct_vm.sender = direct_bob
    large_submission = "x" * 18_000
    controller.submit_milestone(
        milestone_id,
        SUBMISSION_URI,
        hashlib.sha256(large_submission.encode()).hexdigest(),
    )
    direct_vm.sender = direct_owner
    controller.mark_milestone_ready(milestone_id)
    direct_vm.sender = direct_bob
    controller.mark_milestone_ready(milestone_id)
    direct_vm.mock_web(r"baseline\.example/project\.txt", {"status": 200, "body": large_baseline})
    direct_vm.mock_web(r"acceptance\.example/project\.json", {"status": 200, "body": ACCEPTANCE})
    direct_vm.mock_web(r"baseline\.example/project-submission\.txt", {"status": 200, "body": large_submission})

    assert int(controller.resolve_milestone(milestone_id)) == 0
    milestone = controller.get_milestone(milestone_id)
    assert milestone.status == "REPAIR_REQUIRED"
    assert milestone.repair_failure_code == "REVIEW_INPUT_TOO_LARGE"
