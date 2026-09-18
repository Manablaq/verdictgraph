#!/usr/bin/env python3
"""Hash the Vault runtime after applying its immutable Registry address."""

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT = ROOT / "out/VerdictGraphMilestoneVault.sol/VerdictGraphMilestoneVault.json"


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

    artifact = json.loads(ARTIFACT.read_text())
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
