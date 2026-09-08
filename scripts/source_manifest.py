#!/usr/bin/env python3
"""Generate a recursive reviewer/deployment source-integrity manifest.

The manifest covers the complete source/config/docs surface that can affect
VerdictGraph behavior or reviewer claims while deliberately excluding generated
build outputs, caches, virtual environments, and the manifest itself.

`source_set_sha256` is a deterministic deployment identity. It hashes only the
sorted path, per-file SHA-256, and byte length tuples, so regenerating the
manifest at a later time does not change the source-set identity.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FINALITY_PATH = ROOT / "deploy/bradbury.finality.json"
PUBLIC_HOSTING_PATH = ROOT / "deploy/public-hosting.finality.json"
BRADBURY_EXPLORER = "https://explorer-bradbury.genlayer.com"

_reviewer_source_commit = os.environ.get(
    "VERDICTGRAPH_REVIEWER_SOURCE_COMMIT",
    "",
).strip()
REVIEWER_SOURCE_COMMIT = _reviewer_source_commit or None

STATIC_PATHS = {
    ".gitignore",
    ".npmrc",
    ".nvmrc",
    "README.md",
    "foundry.toml",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "deploy/bradbury.template.json",
    "frontend/.env.example",
    "frontend/next-env.d.ts",
    "frontend/package.json",
    "frontend/postcss.config.mjs",
    "frontend/tsconfig.json",
}

# The root lockfile is created during Stage 3. Once it exists it becomes part of
# the integrity surface so future installs can use npm ci reproducibly.
OPTIONAL_PATHS = {"package-lock.json"}

SOURCE_ROOTS = (
    "contracts",
    "evm",
    "frontend/app",
    "frontend/components",
    "frontend/lib",
    "scripts",
    "tests",
    "docs",
)

ALLOWED_SUFFIXES = {".py", ".sol", ".ts", ".tsx", ".css", ".mjs", ".sh", ".md", ".json"}
EXCLUDED_PARTS = {
    ".git",
    ".next",
    ".venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "cache",
    "out",
    "artifacts",
    "verification",
}
EXCLUDED_SUFFIXES = {".pyc", ".tsbuildinfo"}
SOURCE_SET_DOMAIN = b"verdictgraph-source-set-v1\0"


def should_include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDED_PARTS for part in rel.parts):
        return False
    if path.suffix in EXCLUDED_SUFFIXES:
        return False
    return path.is_file() and path.suffix in ALLOWED_SUFFIXES


def source_set_sha256(entries: dict[str, dict[str, object]]) -> str:
    digest = hashlib.sha256()
    digest.update(SOURCE_SET_DOMAIN)
    for rel in sorted(entries):
        entry = entries[rel]
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(entry["sha256"]).encode("ascii"))
        digest.update(b"\0")
        digest.update(str(entry["bytes"]).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


paths: set[str] = set(STATIC_PATHS)
for rel in OPTIONAL_PATHS:
    if (ROOT / rel).is_file():
        paths.add(rel)

for root_rel in SOURCE_ROOTS:
    source_root = ROOT / root_rel
    if not source_root.exists():
        raise SystemExit(f"Missing source root: {root_rel}")
    for path in source_root.rglob("*"):
        if should_include(path):
            paths.add(path.relative_to(ROOT).as_posix())

missing = [rel for rel in sorted(paths) if not (ROOT / rel).is_file()]
if missing:
    raise SystemExit("Missing manifest source files: " + ", ".join(missing))

entries: dict[str, dict[str, object]] = {}
for rel in sorted(paths):
    data = (ROOT / rel).read_bytes()
    entries[rel] = {
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
    }

source_set = source_set_sha256(entries)

finality = json.loads(FINALITY_PATH.read_text())
public_hosting = json.loads(PUBLIC_HOSTING_PATH.read_text())

if finality.get("network") != "bradbury":
    raise SystemExit("Bradbury finality record network mismatch")
if finality.get("chain_id") != 4221:
    raise SystemExit("Bradbury finality record chain id mismatch")

addresses = finality.get("addresses") or {}

for key in ("registry", "adjudicator", "vault"):
    value = addresses.get(key)
    if (
        not isinstance(value, str)
        or not value.startswith("0x")
        or len(value) != 42
    ):
        raise SystemExit(
            f"Invalid final {key} address in Bradbury finality record"
        )

if public_hosting.get("state") != "READY":
    raise SystemExit("Public hosting record is not READY")

if public_hosting.get("target") != "production":
    raise SystemExit(
        "Public hosting record is not production-targeted"
    )

manifest = {
    "schema": "verdictgraph-source-manifest-v4-deterministic-source-set",
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "source_set_sha256": source_set,
    "files": entries,
    "deployment": {
        "network": "bradbury",
        "chain_id": 4221,
        "registry_address": addresses["registry"],
        "adjudicator_address": addresses["adjudicator"],
        "vault_address": addresses["vault"],
        "registry_explorer_url": (
            f"{BRADBURY_EXPLORER}/address/{addresses['registry']}"
        ),
        "adjudicator_explorer_url": (
            f"{BRADBURY_EXPLORER}/address/{addresses['adjudicator']}"
        ),
        "vault_explorer_url": (
            f"{BRADBURY_EXPLORER}/address/{addresses['vault']}"
        ),
        "public_frontend_url": public_hosting["public_url"],
        "immutable_frontend_url": public_hosting["immutable_url"],
        "vercel_deployment_id": public_hosting["deployment_id"],
        "deployed_contract_source_commit": finality[
            "deployed_contract_source_commit"
        ],
        "reviewer_source_commit": REVIEWER_SOURCE_COMMIT,
        "git_commit": REVIEWER_SOURCE_COMMIT,
    },
}
path = ROOT / "verification/source-manifest.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(manifest, indent=2) + "\n")
print(path)
print(f"Manifested {len(entries)} source/config/documentation files")
print(f"SOURCE_SET_SHA256={source_set}")
