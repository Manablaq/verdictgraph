#!/usr/bin/env python3
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

# --- final deployment/publication metadata verification ---

finality = json.loads(
    (ROOT / "deploy/bradbury.finality.json").read_text()
)

public_hosting = json.loads(
    (ROOT / "deploy/public-hosting.finality.json").read_text()
)

deployment = manifest.get("deployment") or {}
addresses = finality.get("addresses") or {}

expected_deployment = {
    "network": "bradbury",
    "chain_id": 4221,
    "registry_address": addresses.get("registry"),
    "adjudicator_address": addresses.get("adjudicator"),
    "vault_address": addresses.get("vault"),
    "registry_explorer_url": (
        "https://explorer-bradbury.genlayer.com/address/"
        + str(addresses.get("registry"))
    ),
    "adjudicator_explorer_url": (
        "https://explorer-bradbury.genlayer.com/address/"
        + str(addresses.get("adjudicator"))
    ),
    "vault_explorer_url": (
        "https://explorer-bradbury.genlayer.com/address/"
        + str(addresses.get("vault"))
    ),
    "public_frontend_url": public_hosting.get("public_url"),
    "immutable_frontend_url": public_hosting.get(
        "immutable_url"
    ),
    "vercel_deployment_id": public_hosting.get(
        "deployment_id"
    ),
    "deployed_contract_source_commit": finality.get(
        "deployed_contract_source_commit"
    ),
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

if (
    finality.get("reviewer_source_set_sha256")
    != actual_source_set
):
    raise SystemExit(
        "FAIL Bradbury finality reviewer source-set "
        "digest mismatch\n"
        f"  expected {actual_source_set}\n"
        "  actual   "
        f"{finality.get('reviewer_source_set_sha256')}"
    )

if public_hosting.get("state") != "READY":
    raise SystemExit(
        "FAIL public hosting evidence is not READY"
    )

if public_hosting.get("target") != "production":
    raise SystemExit(
        "FAIL public hosting evidence is not "
        "production-targeted"
    )

if public_hosting.get("sso_protection") is not None:
    raise SystemExit(
        "FAIL public hosting evidence still claims "
        "SSO protection"
    )

required_routes = {
    "/",
    "/app",
    "/docs",
    "/setup",
    "/vault",
    "/workflows",
    "/create",
}

verified_routes = set(
    public_hosting.get(
        "public_routes_verified_http_200",
        [],
    )
)

if verified_routes != required_routes:
    raise SystemExit(
        "FAIL public hosting verified route set mismatch"
    )

reviewer_source_commit = deployment.get(
    "reviewer_source_commit"
)

if reviewer_source_commit is not None:
    if (
        not isinstance(reviewer_source_commit, str)
        or len(reviewer_source_commit) != 40
        or any(
            c not in "0123456789abcdef"
            for c in reviewer_source_commit.lower()
        )
    ):
        raise SystemExit(
            "FAIL reviewer_source_commit is not a "
            "40-character Git SHA"
        )

print(
    "PASS deployment metadata matches canonical "
    "Bradbury finality evidence"
)

print(
    "PASS public frontend metadata matches canonical "
    "hosting evidence"
)

print(
    "PASS Bradbury finality record binds the "
    "deterministic reviewer source set"
)
