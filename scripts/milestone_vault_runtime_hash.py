#!/usr/bin/env python3
"""Hash the Vault runtime after applying its immutable Registry address."""

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

ARTIFACT_RELATIVE_PATH = (
    Path("VerdictGraphMilestoneVault.sol")
    / "VerdictGraphMilestoneVault.json"
)

# Foundry 1.8.1 can materialize the dynamically linked build artifact under
# `artifacts/`, while older/cached local builds may still have the conventional
# `out/` copy. Accept either deterministic location, but never silently choose
# between disagreeing copies.
ARTIFACT_CANDIDATES = (
    ROOT / "artifacts" / ARTIFACT_RELATIVE_PATH,
    ROOT / "out" / ARTIFACT_RELATIVE_PATH,
)


def load_artifact() -> dict:
    existing = [
        candidate
        for candidate in ARTIFACT_CANDIDATES
        if candidate.is_file()
    ]

    if not existing:
        checked = ", ".join(str(path) for path in ARTIFACT_CANDIDATES)
        raise SystemExit(
            "milestone Vault build artifact not found; checked: "
            + checked
        )

    payloads = [
        (candidate, candidate.read_bytes())
        for candidate in existing
    ]

    if len(payloads) > 1:
        payload_hashes = {
            hashlib.sha256(payload).hexdigest()
            for _, payload in payloads
        }
        if len(payload_hashes) != 1:
            locations = ", ".join(str(path) for path, _ in payloads)
            raise SystemExit(
                "milestone Vault artifact copies disagree: "
                + locations
            )

    return json.loads(payloads[0][1])


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: milestone_vault_runtime_hash.py REGISTRY_ADDRESS")
    address = sys.argv[1].lower()
    if not (address.startswith("0x") and len(address) == 42):
        raise SystemExit("invalid Registry address")
    try:
        registry = bytes.fromhex(address[2:])
    except ValueError as exc:
        raise SystemExit("invalid Registry address") from exc

    artifact = load_artifact()
    runtime_hex = artifact["deployedBytecode"]["object"]
    runtime = bytes.fromhex(runtime_hex[2:])
    zero_address = bytes(20)
    placeholder = bytes([0x7F]) + bytes(12) + zero_address
    immutable_slots = runtime.count(placeholder)
    if immutable_slots != 4:
        raise SystemExit(f"unexpected immutable placeholder count: {immutable_slots}")
    specialized = runtime
    for _ in range(immutable_slots):
        offset = specialized.find(placeholder)
        specialized = specialized[: offset + 13] + registry + specialized[offset + 33 :]
    print(hashlib.sha256(specialized).hexdigest())


if __name__ == "__main__":
    main()
