import hashlib
import json
import os

import pytest

from tests.direct.conftest import TEST_TIME_ISO, to_hex

pytestmark = pytest.mark.skipif(
    os.environ.get("VERDICTGRAPH_MILESTONE_DIRECT_ROLE") != "authority",
    reason="Milestone Authority Direct tests run in their isolated process",
)

CONTRACT = os.environ.get(
    "VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT",
    "contracts/verdict_graph_milestone_authority.py",
)
AUTHORITY_SOURCE_SHA256 = hashlib.sha256(open(CONTRACT, "rb").read()).hexdigest()
PROJECT_REF = "verdictgraph"
BASELINE_URI = "https://baseline.example/project.txt"
BASELINE_MIRROR_URI = "https://baseline-mirror.example/project.txt"
ACCEPTANCE_URI = "https://acceptance.example/project.json"
ACCEPTANCE_MIRROR_URI = "https://acceptance-mirror.example/project.json"


def test_authority_is_write_once_and_exports_a_canonical_snapshot(
    direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    authority = direct_deploy(CONTRACT, to_hex(direct_alice), AUTHORITY_SOURCE_SHA256)

    assert to_hex(authority.get_acceptance_authority()) == to_hex(direct_alice)
    assert authority.get_project_count() == 0

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the acceptance authority can register a project"):
        authority.register_accepted_project(
            PROJECT_REF,
            to_hex(direct_owner),
            BASELINE_URI,
            hashlib.sha256(b"baseline").hexdigest(),
            BASELINE_MIRROR_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(b"acceptance").hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )

    direct_vm.sender = direct_alice
    authority.register_accepted_project(
        PROJECT_REF,
        to_hex(direct_owner),
        BASELINE_URI,
        hashlib.sha256(b"baseline").hexdigest(),
        BASELINE_MIRROR_URI,
        ACCEPTANCE_URI,
        hashlib.sha256(b"acceptance").hexdigest(),
        ACCEPTANCE_MIRROR_URI,
    )
    assert authority.get_project_count() == 1
    record = authority.get_accepted_project(PROJECT_REF)
    assert record.project_ref == PROJECT_REF
    assert to_hex(record.sponsor) == to_hex(direct_owner)
    snapshot = json.loads(authority.get_project_snapshot(PROJECT_REF))
    assert snapshot["version"] == 1
    assert snapshot["project_ref"] == PROJECT_REF
    assert snapshot["sponsor"].lower() == to_hex(direct_owner).lower()
    assert json.loads(snapshot["submission_origins_json"]) == [
        "https://acceptance-mirror.example",
        "https://acceptance.example",
        "https://baseline-mirror.example",
        "https://baseline.example",
    ]

    with direct_vm.expect_revert("Accepted project reference is already registered"):
        authority.register_accepted_project(
            PROJECT_REF,
            to_hex(direct_owner),
            BASELINE_URI,
            hashlib.sha256(b"changed").hexdigest(),
            BASELINE_MIRROR_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(b"acceptance").hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )


def test_authority_rejects_same_source_and_malformed_public_origins(
    direct_vm, direct_deploy, direct_owner, direct_alice
):
    direct_vm.warp(TEST_TIME_ISO)
    direct_vm.sender = direct_owner
    authority = direct_deploy(CONTRACT, to_hex(direct_alice), AUTHORITY_SOURCE_SHA256)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Accepted baseline mirror must be a distinct URI"):
        authority.register_accepted_project(
            "bad-origin",
            to_hex(direct_owner),
            BASELINE_URI,
            hashlib.sha256(b"baseline").hexdigest(),
            BASELINE_URI,
            ACCEPTANCE_URI,
            hashlib.sha256(b"acceptance").hexdigest(),
            ACCEPTANCE_MIRROR_URI,
        )
