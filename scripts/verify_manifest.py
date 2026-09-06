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
