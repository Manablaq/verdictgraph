#!/usr/bin/env python3
"""Verify the deterministic reviewer source set and release/deployment bindings.

The current reviewer source set is intentionally independent from historical
Bradbury finality evidence and from mutable hosting metadata. This avoids a
self-referential source-set digest while still verifying that the manifest
points at the exact audited core deployment, milestone deployment, accepted
project trust root and current production baseline.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SET_DOMAIN = b"verdictgraph-source-set-v1\0"

manifest = json.loads((ROOT / "verification/source-manifest.json").read_text())
failures = []
actual_entries: dict[str, dict[str, object]] = {}

for rel, expected in manifest["files"].items():
    path = ROOT / rel
    if not path.exists():
        actual = None
        actual_size = None
    else:
        data = path.read_bytes()
        actual = hashlib.sha256(data).hexdigest()
        actual_size = len(data)
        actual_entries[rel] = {"sha256": actual, "bytes": actual_size}
    if actual != expected["sha256"] or actual_size != expected["bytes"]:
        failures.append((rel, expected, actual, actual_size))

if failures:
    for rel, expected, actual, actual_size in failures:
        print(
            f"FAIL {rel}\n"
            f"  expected sha256={expected['sha256']} bytes={expected['bytes']}\n"
            f"  actual   sha256={actual} bytes={actual_size}"
        )
    raise SystemExit(1)

source_set = hashlib.sha256()
source_set.update(SOURCE_SET_DOMAIN)
for rel in sorted(actual_entries):
    entry = actual_entries[rel]
    source_set.update(rel.encode("utf-8"))
    source_set.update(b"\0")
    source_set.update(str(entry["sha256"]).encode("ascii"))
    source_set.update(b"\0")
    source_set.update(str(entry["bytes"]).encode("ascii"))
    source_set.update(b"\n")
actual_source_set = source_set.hexdigest()
expected_source_set = manifest.get("source_set_sha256")
if actual_source_set != expected_source_set:
    raise SystemExit(
        "FAIL deterministic source-set digest\n"
        f"  expected {expected_source_set}\n"
        f"  actual   {actual_source_set}"
    )

print(f"PASS {len(manifest['files'])} critical source hashes match the manifest")
print(f"PASS deterministic source-set digest = {actual_source_set}")

# --- audited base deployment ---
finality = json.loads((ROOT / "deploy/bradbury.finality.json").read_text())
public_hosting = json.loads((ROOT / "deploy/public-hosting.finality.json").read_text())
milestone = json.loads((ROOT / "deploy/milestone-bradbury.template.json").read_text())

deployment = manifest.get("deployment") or {}
addresses = finality.get("addresses") or {}
expected_deployment = {
    "network": "bradbury",
    "chain_id": 4221,
    "registry_address": addresses.get("registry"),
    "adjudicator_address": addresses.get("adjudicator"),
    "vault_address": addresses.get("vault"),
    "registry_explorer_url": "https://explorer-bradbury.genlayer.com/address/" + str(addresses.get("registry")),
    "adjudicator_explorer_url": "https://explorer-bradbury.genlayer.com/address/" + str(addresses.get("adjudicator")),
    "vault_explorer_url": "https://explorer-bradbury.genlayer.com/address/" + str(addresses.get("vault")),
    "public_frontend_url": public_hosting.get("public_url"),
    "immutable_frontend_url": public_hosting.get("immutable_url"),
    "vercel_deployment_id": public_hosting.get("deployment_id"),
    "deployed_contract_source_commit": finality.get("deployed_contract_source_commit"),
    "base_release_source_set_sha256": finality.get("reviewer_source_set_sha256"),
}
for key, expected in expected_deployment.items():
    actual = deployment.get(key)
    if actual != expected:
        raise SystemExit(
            "FAIL deployment metadata mismatch\n"
            f"  field    {key}\n"
            f"  expected {expected!r}\n"
            f"  actual   {actual!r}"
        )

# --- milestone deployment / trust root ---
if milestone.get("deploymentStatus") != "DEPLOYED":
    raise SystemExit("FAIL milestone deployment is not DEPLOYED")
if milestone.get("network") != "bradbury" or milestone.get("chainId") != 4221:
    raise SystemExit("FAIL milestone deployment network/chain mismatch")
if milestone.get("vaultRuntimeSha256") != milestone.get("expectedVaultRuntimeSha256"):
    raise SystemExit("FAIL milestone Vault runtime identity mismatch")

accepted = milestone.get("acceptedProjectRegistration") or {}
if accepted.get("status") != "Finalized" or accepted.get("statusCode") != 7:
    raise SystemExit("FAIL accepted-project registration is not Finalized/status 7")

milestone_manifest = manifest.get("milestone_deployment") or {}
expected_milestone = {
    "network": milestone.get("network"),
    "chain_id": milestone.get("chainId"),
    "authority_address": milestone.get("authorityAddress"),
    "registry_address": milestone.get("registryAddress"),
    "adjudicator_address": milestone.get("adjudicatorAddress"),
    "vault_address": milestone.get("vaultAddress"),
    "authority_source_sha256": (milestone.get("deploymentArtifactSha256") or {}).get("authority"),
    "registry_source_sha256": (milestone.get("deploymentArtifactSha256") or {}).get("registry"),
    "adjudicator_source_sha256": (milestone.get("deploymentArtifactSha256") or {}).get("adjudicator"),
    "vault_runtime_sha256": milestone.get("vaultRuntimeSha256"),
    "authority_explorer_url": milestone.get("authorityExplorerUrl"),
    "registry_explorer_url": milestone.get("registryExplorerUrl"),
    "adjudicator_explorer_url": milestone.get("adjudicatorExplorerUrl"),
    "vault_explorer_url": milestone.get("vaultExplorerUrl"),
    "accepted_project_ref": accepted.get("projectRef"),
    "accepted_project_registration_tx": accepted.get("registrationTransaction"),
    "accepted_project_baseline_sha256": accepted.get("baselineSha256"),
    "accepted_project_record_sha256": accepted.get("acceptanceRecordSha256"),
}
for key, expected in expected_milestone.items():
    actual = milestone_manifest.get(key)
    if actual != expected:
        raise SystemExit(
            "FAIL milestone deployment metadata mismatch\n"
            f"  field    {key}\n"
            f"  expected {expected!r}\n"
            f"  actual   {actual!r}"
        )

# Bind on-chain constructor source identities back to exact repository bytes.
def sha256_file(rel: str) -> str:
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()

artifact_hashes = milestone.get("deploymentArtifactSha256") or {}
canonical_hashes = milestone.get("canonicalSourceSha256") or {}
for role, rel in {
    "authority": "contracts/verdict_graph_milestone_authority_deploy.py",
    "registry": "contracts/verdict_graph_milestone_registry_deploy.py",
    "adjudicator": "contracts/verdict_graph_milestone_adjudicator_deploy.py",
}.items():
    actual = sha256_file(rel)
    expected = artifact_hashes.get(role)
    if actual != expected:
        raise SystemExit(f"FAIL milestone {role} deployment artifact hash: expected {expected}, actual {actual}")

for role, rel in {
    "authority": "contracts/verdict_graph_milestone_authority.py",
    "registry": "contracts/verdict_graph_milestone_registry.py",
    "adjudicator": "contracts/verdict_graph_milestone_adjudicator.py",
}.items():
    actual = sha256_file(rel)
    expected = canonical_hashes.get(role)
    if actual != expected:
        raise SystemExit(f"FAIL milestone {role} canonical source hash: expected {expected}, actual {actual}")

baseline_rel = "frontend/public/milestones/accepted-baseline-v2.json"
record_rel = "frontend/public/milestones/acceptance-record-v2.json"
if sha256_file(baseline_rel) != accepted.get("baselineSha256"):
    raise SystemExit("FAIL accepted baseline bytes do not match the finalized trust root")
if sha256_file(record_rel) != accepted.get("acceptanceRecordSha256"):
    raise SystemExit("FAIL acceptance-record bytes do not match the finalized trust root")

# --- current production hosting baseline ---
if public_hosting.get("state") != "READY" or public_hosting.get("target") != "production":
    raise SystemExit("FAIL public hosting evidence is not READY production")
if public_hosting.get("sso_protection") is not None:
    raise SystemExit("FAIL public hosting evidence still claims SSO protection")

expected_core_routes = {"/", "/app", "/docs", "/setup", "/vault", "/workflows", "/create"}
if set(public_hosting.get("public_routes_verified_http_200", [])) != expected_core_routes:
    raise SystemExit("FAIL public hosting core route set mismatch")

required_milestone_routes = {
    "/milestones",
    "/milestones/authority",
    "/milestones/create",
    "/milestones/1",
    "/milestones/1/proof",
    "/milestones/2",
    "/milestones/2/proof",
}
if not required_milestone_routes.issubset(set(public_hosting.get("public_milestone_routes_verified_http_200", []))):
    raise SystemExit("FAIL public hosting milestone route coverage is incomplete")

required_acceptance_routes = {
    "/milestones/accepted-baseline-v2.json",
    "/milestones/acceptance-record-v2.json",
}
if not required_acceptance_routes.issubset(set(public_hosting.get("public_acceptance_record_routes_verified_http_200", []))):
    raise SystemExit("FAIL public acceptance-record route coverage is incomplete")

production_baseline = manifest.get("production_baseline") or {}
expected_production = {
    "public_frontend_url": public_hosting.get("public_url"),
    "immutable_frontend_url": public_hosting.get("immutable_url"),
    "vercel_deployment_id": public_hosting.get("deployment_id"),
    "source_commit": public_hosting.get("public_deployment_source_commit"),
    "verified_at": public_hosting.get("public_access_verified_at_utc"),
}
for key, expected in expected_production.items():
    actual = production_baseline.get(key)
    if actual != expected:
        raise SystemExit(
            "FAIL production-baseline metadata mismatch\n"
            f"  field    {key}\n"
            f"  expected {expected!r}\n"
            f"  actual   {actual!r}"
        )

for label, value in {
    "reviewer_source_commit": deployment.get("reviewer_source_commit"),
    "production source commit": public_hosting.get("public_deployment_source_commit"),
}.items():
    if value is not None:
        if not isinstance(value, str) or len(value) != 40 or any(c not in "0123456789abcdef" for c in value.lower()):
            raise SystemExit(f"FAIL {label} is not a 40-character Git SHA")

print("PASS audited base deployment metadata matches canonical Bradbury evidence")
print("PASS milestone deployment source/address/trust-root bindings match exact repository bytes")
print("PASS current production-baseline metadata matches public-hosting evidence")
