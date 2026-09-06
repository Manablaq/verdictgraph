import os
import hashlib
import json

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

CONTRACT = os.environ.get("VERDICTGRAPH_CONTRACT", "contracts/verdict_graph_core.py")
P1 = "https://evidence.example/"
P2 = "https://corroboration.example/"
E1 = "Official record: deadline 2026-08-30; status closed."
E2 = "Independent archive: deadline 2026-08-30; status closed."


def _case(contract, vm, owner, requester, provider, issuer):
    vm.sender = owner
    policy_id = contract.create_evidence_policy(
        "Two-source policy", 1, 600, 60, 2, 2, 300, 600, 3_600
    )
    contract.add_policy_issuer(policy_id, to_hex(owner))
    contract.add_policy_issuer(policy_id, to_hex(issuer))
    contract.add_policy_publisher(policy_id, P1)
    contract.add_policy_publisher(policy_id, P2)
    contract.seal_evidence_policy(policy_id)
    workflow_id = contract.create_workflow(
        "Workflow", "Verify one deadline", policy_id, TEST_TIME_UNIX + 20_000
    )
    handoff_id = contract.add_handoff(
        workflow_id,
        to_hex(requester),
        to_hex(provider),
        "Verify deadline status",
        json.dumps([
            {
                "id": 1,
                "text": "A closed deadline must not be certified as open.",
                "fault_class": "VERIFICATION_FAILURE",
                "consequence_rule_id": 2,
            }
        ]),
        1_000,
        200,
        TEST_TIME_UNIX + 1_000,
        TEST_TIME_UNIX + 5_000,
        TEST_TIME_UNIX + 10_000,
    )
    contract.activate_workflow(workflow_id)
    vm.sender = requester
    case_id = contract.open_case(workflow_id, handoff_id, "Closed deadline was certified open")
    return case_id


def _evidence(contract, vm, owner, issuer, case_id):
    vm.sender = issuer
    contract.register_evidence(
        case_id,
        "record-primary-v1",
        P1,
        P1 + "primary.txt",
        hashlib.sha256(E1.encode()).hexdigest(),
        1,
        TEST_TIME_UNIX - 120,
        TEST_TIME_UNIX - 60,
        TEST_TIME_UNIX + 2_000,
        "deadline-fact",
    )
    vm.sender = owner
    contract.register_evidence(
        case_id,
        "record-corroboration-v1",
        P2,
        P2 + "corroboration.txt",
        hashlib.sha256(E2.encode()).hexdigest(),
        1,
        TEST_TIME_UNIX - 120,
        TEST_TIME_UNIX - 60,
        TEST_TIME_UNIX + 2_000,
        "deadline-fact",
    )


def _ready(contract, vm, requester, provider, case_id):
    vm.sender = requester
    contract.mark_revision_ready(case_id)
    vm.sender = provider
    contract.mark_revision_ready(case_id)


def _review_mocks(vm, response_text=None):
    vm.mock_web(r"evidence\.example/primary\.txt", {"status": 200, "body": E1})
    vm.mock_web(r"corroboration\.example/corroboration\.txt", {"status": 200, "body": E2})
    if response_text is not None:
        vm.mock_web(r"response\.example/provider\.txt", {"status": 200, "body": response_text})
    vm.mock_llm(
        r"VERDICTGRAPH_HANDOFF_REVIEW_V1",
        json.dumps(
            {
                "decision": "BREACH",
                "violated_rule_id": 1,
                "summary": "Both authenticated sources show the deadline was closed.",
            }
        ),
    )


def test_initial_party_response_is_hash_verified_and_reviewed(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)

    response = "Provider response: I relied on an earlier cached page."
    direct_vm.sender = direct_bob
    contract.submit_response(
        case_id,
        "https://response.example/provider.txt",
        hashlib.sha256(response.encode()).hexdigest(),
    )
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)
    _review_mocks(direct_vm, response)

    verdict_id = contract.resolve_case(case_id)
    assert int(verdict_id) > 0
    verdict = contract.get_verdict(verdict_id)
    assert verdict.decision == "BREACH"
    assert len(verdict.policy_fingerprint_sha256) == 64


def test_response_hash_failure_is_persisted_as_repairable(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)

    direct_vm.sender = direct_bob
    contract.submit_response(
        case_id,
        "https://response.example/provider.txt",
        hashlib.sha256(b"expected response").hexdigest(),
    )
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)
    _review_mocks(direct_vm, "tampered response")

    assert int(contract.resolve_case(case_id)) == 0
    revision = contract.get_revision(case_id, 1)
    assert revision.status == "REPAIR_REQUIRED"
    assert revision.failure_code == "RESPONSE_HASH_MISMATCH"
    assert int(revision.failed_evidence_id) == 0
    assert len(revision.observed_failure_sha256) == 64


def test_evidence_is_rechecked_for_freshness_at_review_time(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)

    direct_vm.warp("2026-09-06T10:11:00+00:00")
    assert int(contract.resolve_case(case_id)) == 0
    revision = contract.get_revision(case_id, 1)
    assert revision.failure_code == "EVIDENCE_STALE_AT_REVIEW"
    assert int(revision.failed_evidence_id) > 0


def test_open_case_has_deadline_recovery(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    recovery_deadline = int(contract.get_case(case_id).recovery_deadline)

    # Direct Mode warp uses an ISO transaction time. This value is after the
    # 3,600-second application recovery horizon used by _case().
    direct_vm.warp("2026-09-06T11:00:01+00:00")
    assert recovery_deadline < TEST_TIME_UNIX + 3_602
    contract.recover_case(case_id)
    assert contract.get_case(case_id).status == "RECOVERED"


def _resolve_reviewed_case(contract, vm, owner, requester, provider, issuer):
    case_id = _case(contract, vm, owner, requester, provider, issuer)
    _evidence(contract, vm, owner, issuer, case_id)
    _ready(contract, vm, requester, provider, case_id)
    _review_mocks(vm)
    verdict_id = contract.resolve_case(case_id)
    assert int(verdict_id) > 0
    assert contract.get_case(case_id).status == "REVIEWED"
    return case_id, verdict_id


def test_reviewed_verdict_has_bounded_post_review_response_window(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id, verdict_id = _resolve_reviewed_case(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    case = contract.get_case(case_id)
    assert int(case.latest_verdict_id) == int(verdict_id)
    assert case.settlement_queued is False
    assert int(case.settlement_earliest_at) == TEST_TIME_UNIX + 300


def test_fresh_revision_supersedes_reviewed_verdict_before_settlement(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id, _ = _resolve_reviewed_case(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    counter = "New counter-evidence changes the material facts."
    direct_vm.sender = direct_bob
    revision_no = contract.begin_revision(
        case_id,
        "https://response.example/provider-r2.txt",
        hashlib.sha256(counter.encode()).hexdigest(),
    )
    case = contract.get_case(case_id)
    assert int(revision_no) == 2
    assert case.status == "OPEN"
    assert int(case.latest_verdict_id) == 0
    assert int(case.settlement_earliest_at) == 0
    assert case.settlement_queued is False


def test_settlement_cannot_queue_before_post_review_window_closes(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id, verdict_id = _resolve_reviewed_case(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    with direct_vm.expect_revert("Post-review response window is still open"):
        contract.queue_settlement(case_id, verdict_id)


def test_only_latest_reviewed_verdict_can_queue_and_blocks_new_revision(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id, verdict_id = _resolve_reviewed_case(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    direct_vm.warp("2026-09-06T10:05:01+00:00")
    with direct_vm.expect_revert("latest verdict"):
        contract.queue_settlement(case_id, verdict_id + 1)

    contract.queue_settlement(case_id, verdict_id)
    queued = contract.get_case(case_id)
    assert queued.settlement_queued is True
    assert int(queued.settlement_attempt_count) == 0  # no Vault bound in this unit test
    assert int(queued.vault_terminal_status) == 0

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Settlement is already queued"):
        contract.begin_revision(
            case_id,
            "https://response.example/too-late.txt",
            hashlib.sha256(b"too late").hexdigest(),
        )


def test_queued_settlement_retry_requires_bound_vault(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id, verdict_id = _resolve_reviewed_case(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    direct_vm.warp("2026-09-06T10:05:01+00:00")
    contract.queue_settlement(case_id, verdict_id)
    with direct_vm.expect_revert("Vault is not bound"):
        contract.queue_settlement(case_id, verdict_id)


def test_submitted_delivery_bytes_are_hash_verified_during_dispute_review(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)

    direct_vm.sender = direct_owner
    policy_id = contract.create_evidence_policy(
        "Delivery-aware policy", 1, 600, 60, 2, 2, 300, 600, 3_600
    )
    contract.add_policy_issuer(policy_id, to_hex(direct_owner))
    contract.add_policy_issuer(policy_id, to_hex(direct_charlie))
    contract.add_policy_publisher(policy_id, P1)
    contract.add_policy_publisher(policy_id, P2)
    contract.seal_evidence_policy(policy_id)
    workflow_id = contract.create_workflow(
        "Delivery-aware workflow", "Review the submitted artifact", policy_id, TEST_TIME_UNIX + 20_000
    )
    handoff_id = contract.add_handoff(
        workflow_id,
        to_hex(direct_alice),
        to_hex(direct_bob),
        "Deliver a verified deadline report",
        json.dumps([{
            "id": 1,
            "text": "A closed deadline must not be certified as open.",
            "fault_class": "VERIFICATION_FAILURE",
            "consequence_rule_id": 2,
        }]),
        1_000, 200,
        TEST_TIME_UNIX + 1_000,
        TEST_TIME_UNIX + 5_000,
        TEST_TIME_UNIX + 10_000,
    )
    contract.activate_workflow(workflow_id)

    expected_delivery = "Provider report: grant is open."
    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id,
        "https://delivery.example/report.txt",
        hashlib.sha256(expected_delivery.encode()).hexdigest(),
    )
    direct_vm.sender = direct_alice
    case_id = contract.open_case(workflow_id, handoff_id, "The submitted report contradicts authoritative records")
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)

    direct_vm.mock_web(r"delivery\.example/report\.txt", {"status": 200, "body": "tampered delivery"})
    assert int(contract.resolve_case(case_id)) == 0
    revision = contract.get_revision(case_id, 1)
    assert revision.status == "REPAIR_REQUIRED"
    assert revision.failure_code == "DELIVERY_HASH_MISMATCH"
    assert int(revision.failed_evidence_id) == 0
    assert len(revision.observed_failure_sha256) == 64


def test_repair_revision_carries_valid_sources_and_allows_only_failed_stable_record_upgrade(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id = _case(contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie)
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)

    # Primary source hash fails; the corroborating record is still valid.
    direct_vm.mock_web(r"evidence\.example/primary\.txt", {"status": 200, "body": "tampered primary"})
    assert int(contract.resolve_case(case_id)) == 0
    failed_revision = contract.get_revision(case_id, 1)
    failed_id = failed_revision.failed_evidence_id
    assert int(failed_id) > 0
    assert failed_revision.failure_code == "SOURCE_HASH_MISMATCH"

    # A participant can start an evidence-only repair revision without inventing
    # a new response document. The valid corroborator is carried automatically.
    direct_vm.sender = direct_bob
    new_revision_no = contract.begin_revision(case_id, "", "")
    assert int(new_revision_no) == 2
    repaired_revision = contract.get_revision(case_id, 2)
    assert int(repaired_revision.evidence_count) == 1
    assert int(repaired_revision.distinct_issuer_count) == 1
    assert int(repaired_revision.distinct_publisher_count) == 1

    # The exact failed stable ID may return only from the same authenticated issuer
    # and only as a strictly higher version.
    prior = contract.get_evidence(failed_id)
    direct_vm.sender = direct_charlie
    repaired_id = contract.register_evidence(
        case_id,
        prior.stable_record_id,
        prior.publisher_prefix,
        prior.source_uri,
        hashlib.sha256(E1.encode()).hexdigest(),
        2,
        TEST_TIME_UNIX - 30,
        TEST_TIME_UNIX - 10,
        TEST_TIME_UNIX + 2_000,
        prior.corroboration_group,
    )
    assert int(repaired_id) > int(failed_id)
    repaired_revision = contract.get_revision(case_id, 2)
    assert int(repaired_revision.evidence_count) == 2
    assert int(repaired_revision.distinct_issuer_count) == 2
    assert int(repaired_revision.distinct_publisher_count) == 2


def test_nonfailed_stable_record_cannot_be_reused_in_fresh_review_revision(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    case_id, _ = _resolve_reviewed_case(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    counter = "Counter-evidence requests a fresh semantic review."
    direct_vm.sender = direct_bob
    contract.begin_revision(
        case_id,
        "https://response.example/provider-r2.txt",
        hashlib.sha256(counter.encode()).hexdigest(),
    )
    prior = contract.get_evidence(1)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Stable evidence id has already been consumed"):
        contract.register_evidence(
            case_id,
            prior.stable_record_id,
            prior.publisher_prefix,
            prior.source_uri,
            prior.expected_sha256,
            2,
            TEST_TIME_UNIX - 30,
            TEST_TIME_UNIX - 10,
            TEST_TIME_UNIX + 2_000,
            prior.corroboration_group,
        )


def test_delivery_repair_creates_new_immutable_version_and_preserves_history(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)

    direct_vm.sender = direct_owner
    policy_id = contract.create_evidence_policy(
        "Delivery repair policy", 1, 600, 60, 2, 2, 300, 600, 3_600
    )
    contract.add_policy_issuer(policy_id, to_hex(direct_owner))
    contract.add_policy_issuer(policy_id, to_hex(direct_charlie))
    contract.add_policy_publisher(policy_id, P1)
    contract.add_policy_publisher(policy_id, P2)
    contract.seal_evidence_policy(policy_id)
    workflow_id = contract.create_workflow(
        "Delivery repair workflow", "Repair a pinned delivery", policy_id, TEST_TIME_UNIX + 20_000
    )
    handoff_id = contract.add_handoff(
        workflow_id, to_hex(direct_alice), to_hex(direct_bob), "Deliver report",
        json.dumps([{
            "id": 1,
            "text": "The report must reflect authoritative deadline status.",
            "fault_class": "VERIFICATION_FAILURE",
            "consequence_rule_id": 2,
        }]),
        1_000, 200, TEST_TIME_UNIX + 1_000, TEST_TIME_UNIX + 5_000, TEST_TIME_UNIX + 10_000,
    )
    contract.activate_workflow(workflow_id)

    original = "provider report v1"
    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id,
        "https://delivery.example/report-v1.txt",
        hashlib.sha256(original.encode()).hexdigest(),
    )
    direct_vm.sender = direct_alice
    case_id = contract.open_case(workflow_id, handoff_id, "Delivery must be reviewed")
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)

    direct_vm.mock_web(r"delivery\.example/report-v1\.txt", {"status": 200, "body": "wrong bytes"})
    assert int(contract.resolve_case(case_id)) == 0
    assert contract.get_revision(case_id, 1).failure_code == "DELIVERY_HASH_MISMATCH"

    repaired = "provider report v2 with corrected immutable bytes"
    direct_vm.sender = direct_bob
    version = contract.repair_handoff_delivery(
        case_id,
        "https://delivery.example/report-v2.txt",
        hashlib.sha256(repaired.encode()).hexdigest(),
    )
    assert int(version) == 2
    assert contract.get_delivery(handoff_id, 1).delivery_sha256 == hashlib.sha256(original.encode()).hexdigest()
    assert contract.get_delivery(handoff_id, 2).delivery_sha256 == hashlib.sha256(repaired.encode()).hexdigest()
    assert int(contract.get_handoff(handoff_id).delivery_version) == 2

    # Fresh review is explicit; repairing the artifact does not silently mutate
    # the already-failed revision into a successful one.
    contract.begin_revision(case_id, "", "")
    assert int(contract.get_case(case_id).current_revision) == 2
    assert contract.get_case(case_id).status == "OPEN"


def test_transient_delivery_fetch_failure_can_retry_same_revision_without_fake_new_evidence(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)

    direct_vm.sender = direct_owner
    policy_id = contract.create_evidence_policy(
        "Retry policy", 1, 600, 60, 2, 2, 300, 600, 3_600
    )
    contract.add_policy_issuer(policy_id, to_hex(direct_owner))
    contract.add_policy_issuer(policy_id, to_hex(direct_charlie))
    contract.add_policy_publisher(policy_id, P1)
    contract.add_policy_publisher(policy_id, P2)
    contract.seal_evidence_policy(policy_id)
    workflow_id = contract.create_workflow(
        "Retry workflow", "Retry a transient fetch", policy_id, TEST_TIME_UNIX + 20_000
    )
    handoff_id = contract.add_handoff(
        workflow_id, to_hex(direct_alice), to_hex(direct_bob), "Deliver report",
        json.dumps([{
            "id": 1,
            "text": "The report must reflect authoritative deadline status.",
            "fault_class": "VERIFICATION_FAILURE",
            "consequence_rule_id": 2,
        }]),
        1_000, 200, TEST_TIME_UNIX + 1_000, TEST_TIME_UNIX + 5_000, TEST_TIME_UNIX + 10_000,
    )
    contract.activate_workflow(workflow_id)
    delivery = "provider report"
    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id,
        "https://delivery.example/report.txt",
        hashlib.sha256(delivery.encode()).hexdigest(),
    )
    direct_vm.sender = direct_alice
    case_id = contract.open_case(workflow_id, handoff_id, "Review delivery")
    _evidence(contract, direct_vm, direct_owner, direct_charlie, case_id)
    _ready(contract, direct_vm, direct_alice, direct_bob, case_id)

    direct_vm.mock_web(r"delivery\.example/report\.txt", {"status": 503, "body": "gateway unavailable"})
    assert int(contract.resolve_case(case_id)) == 0
    assert contract.get_revision(case_id, 1).failure_code == "DELIVERY_FETCH_FAILED"

    direct_vm.sender = direct_alice
    contract.retry_current_revision(case_id)
    assert contract.get_case(case_id).status == "OPEN"
    revision = contract.get_revision(case_id, 1)
    assert revision.status == "OPEN"
    assert revision.failure_code == ""
    assert int(revision.evidence_count) == 2
