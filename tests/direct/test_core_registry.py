import os
import json

from tests.direct.conftest import TEST_TIME_ISO, TEST_TIME_UNIX, to_hex

CONTRACT = os.environ.get("VERDICTGRAPH_CONTRACT", "contracts/verdict_graph_core.py")
PUBLISHER = "https://evidence.example/records/"
PUBLISHER_2 = "https://corroboration.example/records/"


def _criteria():
    return json.dumps([
        {
            "id": 1,
            "text": "The provider must verify that every grant deadline is still open at observation time.",
            "fault_class": "VERIFICATION_FAILURE",
            "consequence_rule_id": 2,
        },
        {
            "id": 2,
            "text": "The provider must deliver the required fields for every shortlisted grant.",
            "fault_class": "INCOMPLETE_DELIVERY",
            "consequence_rule_id": 2,
        },
    ])


def _sealed_policy(contract, vm, owner, issuer):
    vm.sender = owner
    policy_id = contract.create_evidence_policy(
        "Grant evidence policy",
        1,
        86_400,
        3_600,
        2,
        2,
        3_600,
        7_200,
        86_400,
    )
    contract.add_policy_issuer(policy_id, to_hex(owner))
    contract.add_policy_issuer(policy_id, to_hex(issuer))
    contract.add_policy_publisher(policy_id, PUBLISHER)
    contract.add_policy_publisher(policy_id, PUBLISHER_2)
    fingerprint = contract.seal_evidence_policy(policy_id)
    return policy_id, fingerprint


def test_policy_is_immutable_after_seal(direct_vm, direct_deploy, direct_owner, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    policy_id, fingerprint = _sealed_policy(contract, direct_vm, direct_owner, direct_charlie)

    assert len(fingerprint) == 64
    policy = contract.get_policy(policy_id)
    assert policy.sealed is True
    assert policy.fingerprint_sha256 == fingerprint

    with direct_vm.expect_revert("Sealed policy cannot be changed"):
        contract.add_policy_publisher(policy_id, "https://other.example/")


def test_workflow_handoff_and_activation(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    policy_id, _ = _sealed_policy(contract, direct_vm, direct_owner, direct_charlie)

    direct_vm.sender = direct_owner
    workflow_id = contract.create_workflow(
        "Grant research pipeline",
        "Produce a verified shortlist of active grants.",
        policy_id,
        TEST_TIME_UNIX + 7 * 86_400,
    )
    handoff_id = contract.add_handoff(
        workflow_id,
        to_hex(direct_alice),
        to_hex(direct_bob),
        "Verify eligibility and application deadlines.",
        _criteria(),
        1_000,
        200,
        TEST_TIME_UNIX + 3_600,
        TEST_TIME_UNIX + 2 * 86_400,
        TEST_TIME_UNIX + 3 * 86_400,
    )
    contract.activate_workflow(workflow_id)

    workflow = contract.get_workflow(workflow_id)
    handoff = contract.get_handoff(handoff_id)
    assert workflow.status == "ACTIVE"
    assert int(workflow.handoff_count) == 1
    assert handoff.workflow_id == workflow_id
    assert json.loads(handoff.criteria_json)[0]["id"] == 1


def test_bad_criteria_cannot_define_tolerance_or_arbitrary_rule(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    policy_id, _ = _sealed_policy(contract, direct_vm, direct_owner, direct_charlie)
    direct_vm.sender = direct_owner
    workflow_id = contract.create_workflow(
        "W", "Mission", policy_id, TEST_TIME_UNIX + 86_400
    )

    bad = json.dumps([
        {
            "id": 1,
            "text": "Bad rule",
            "fault_class": "VERIFICATION_FAILURE",
            "consequence_rule_id": 999,
        }
    ])
    with direct_vm.expect_revert("supported breach/recovery consequence"):
        contract.add_handoff(
            workflow_id,
            to_hex(direct_alice),
            to_hex(direct_bob),
            "Responsibility",
            bad,
            1_000,
            200,
            TEST_TIME_UNIX + 1_800,
            TEST_TIME_UNIX + 3_600,
            TEST_TIME_UNIX + 7_200,
        )


def test_handoff_dependencies_are_acyclic_by_construction(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    policy_id, _ = _sealed_policy(contract, direct_vm, direct_owner, direct_charlie)
    direct_vm.sender = direct_owner
    workflow_id = contract.create_workflow(
        "Graph workflow", "Two dependent handoffs", policy_id, TEST_TIME_UNIX + 7 * 86_400
    )
    first = contract.add_handoff(
        workflow_id, to_hex(direct_alice), to_hex(direct_bob), "Research", _criteria(),
        1_000, 200, TEST_TIME_UNIX + 3_600, TEST_TIME_UNIX + 86_400,
        TEST_TIME_UNIX + 2 * 86_400,
    )
    second = contract.add_handoff(
        workflow_id, to_hex(direct_bob), to_hex(direct_charlie), "Verify", _criteria(),
        1_000, 200, TEST_TIME_UNIX + 3_600, TEST_TIME_UNIX + 2 * 86_400,
        TEST_TIME_UNIX + 3 * 86_400,
    )
    contract.add_handoff_dependency(second, first)
    assert contract.get_handoff_dependency(second, 0) == first

    with direct_vm.expect_revert("earlier handoff to a later handoff"):
        contract.add_handoff_dependency(first, second)


def test_creator_scoped_latest_ids_avoid_global_count_races(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    policy_id, _ = _sealed_policy(contract, direct_vm, direct_owner, direct_charlie)
    assert contract.get_latest_policy_for_owner(to_hex(direct_owner)) == policy_id

    direct_vm.sender = direct_owner
    workflow_id = contract.create_workflow(
        "Creator-scoped workflow",
        "Verify creator-scoped identifiers.",
        policy_id,
        TEST_TIME_UNIX + 7 * 86_400,
    )
    assert contract.get_latest_workflow_for_owner(to_hex(direct_owner)) == workflow_id

    handoff_id = contract.add_handoff(
        workflow_id,
        to_hex(direct_alice),
        to_hex(direct_bob),
        "Verify delivery.",
        _criteria(),
        1_000,
        200,
        TEST_TIME_UNIX + 3_600,
        TEST_TIME_UNIX + 2 * 86_400,
        TEST_TIME_UNIX + 3 * 86_400,
    )
    assert contract.get_latest_handoff_for_workflow(workflow_id) == handoff_id
    contract.activate_workflow(workflow_id)

    direct_vm.sender = direct_alice
    case_id = contract.open_case(workflow_id, handoff_id, "Provider missed a registered criterion.")
    assert contract.get_latest_case_for_opener(to_hex(direct_alice)) == case_id


def test_policy_requires_distinct_publisher_origins(
    direct_vm, direct_deploy, direct_owner, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_owner
    policy_id = contract.create_evidence_policy(
        "Publisher-origin policy",
        1,
        86_400,
        3_600,
        2,
        2,
        3_600,
        7_200,
        86_400,
    )
    contract.add_policy_issuer(policy_id, to_hex(direct_owner))
    contract.add_policy_issuer(policy_id, to_hex(direct_charlie))
    contract.add_policy_publisher(policy_id, "https://evidence.example/primary/")
    with direct_vm.expect_revert("Policy publisher origins must be distinct"):
        contract.add_policy_publisher(policy_id, "https://evidence.example/archive/")


def _active_delivery_handoff(contract, vm, owner, requester, provider, issuer):
    policy_id, _ = _sealed_policy(contract, vm, owner, issuer)
    vm.sender = owner
    workflow_id = contract.create_workflow(
        "Delivery workflow",
        "Exercise the successful handoff path.",
        policy_id,
        TEST_TIME_UNIX + 7 * 86_400,
    )
    handoff_id = contract.add_handoff(
        workflow_id,
        to_hex(requester),
        to_hex(provider),
        "Deliver one immutable verified artifact.",
        _criteria(),
        1_000,
        200,
        TEST_TIME_UNIX + 3_600,
        TEST_TIME_UNIX + 2 * 86_400,
        TEST_TIME_UNIX + 3 * 86_400,
    )
    contract.activate_workflow(workflow_id)
    return workflow_id, handoff_id


def test_provider_submits_one_immutable_hash_pinned_delivery(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, handoff_id = _active_delivery_handoff(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )

    delivery = "Verified grant shortlist v1"
    import hashlib
    digest = hashlib.sha256(delivery.encode()).hexdigest()

    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id,
        "https://delivery.example/grants-v1.txt",
        digest,
    )
    handoff = contract.get_handoff(handoff_id)
    assert handoff.delivery_uri == "https://delivery.example/grants-v1.txt"
    assert handoff.delivery_sha256 == digest
    assert int(handoff.delivery_submitted_at) == TEST_TIME_UNIX
    assert handoff.active is True

    with direct_vm.expect_revert("delivery is already submitted"):
        contract.submit_handoff_delivery(
            handoff_id,
            "https://delivery.example/grants-v2.txt",
            hashlib.sha256(b"replacement").hexdigest(),
        )


def test_only_provider_can_submit_delivery(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, handoff_id = _active_delivery_handoff(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    import hashlib
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the handoff provider can submit delivery"):
        contract.submit_handoff_delivery(
            handoff_id,
            "https://delivery.example/grants.txt",
            hashlib.sha256(b"delivery").hexdigest(),
        )


def test_requester_accepts_delivery_and_closes_handoff_without_dispute(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, handoff_id = _active_delivery_handoff(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    import hashlib
    digest = hashlib.sha256(b"delivery").hexdigest()
    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id, "https://delivery.example/grants.txt", digest
    )

    direct_vm.sender = direct_alice
    contract.accept_handoff_delivery(handoff_id)
    handoff = contract.get_handoff(handoff_id)
    assert int(handoff.delivery_accepted_at) == TEST_TIME_UNIX
    assert handoff.completion_queued is True
    assert int(handoff.completion_attempt_count) == 0  # no Vault bound in this unit test
    assert int(handoff.vault_terminal_status) == 0
    assert handoff.active is False


def test_handoff_completion_retry_requires_bound_vault(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    _, handoff_id = _active_delivery_handoff(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    import hashlib
    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id,
        "https://delivery.example/grants.txt",
        hashlib.sha256(b"delivery").hexdigest(),
    )
    direct_vm.sender = direct_alice
    contract.accept_handoff_delivery(handoff_id)
    with direct_vm.expect_revert("Vault is not bound"):
        contract.retry_handoff_completion(handoff_id)


def test_completed_handoff_cannot_be_reopened_as_dispute(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob, direct_charlie
):
    direct_vm.warp(TEST_TIME_ISO)
    contract = direct_deploy(CONTRACT)
    workflow_id, handoff_id = _active_delivery_handoff(
        contract, direct_vm, direct_owner, direct_alice, direct_bob, direct_charlie
    )
    import hashlib
    direct_vm.sender = direct_bob
    contract.submit_handoff_delivery(
        handoff_id,
        "https://delivery.example/grants.txt",
        hashlib.sha256(b"delivery").hexdigest(),
    )
    direct_vm.sender = direct_alice
    contract.accept_handoff_delivery(handoff_id)

    with direct_vm.expect_revert("Completed handoff cannot be disputed"):
        contract.open_case(workflow_id, handoff_id, "Try to reopen settled handoff")
