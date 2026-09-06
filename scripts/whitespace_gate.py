#!/usr/bin/env python3
"""Repository-independent whitespace/conflict-marker gate.

Uses the already-generated recursive source manifest as the authoritative file
surface, so reviewer ZIPs without `.git` receive the same hygiene check as a
clone. This intentionally checks the full manifested tree, not only a Git diff.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "verification/source-manifest.json"

if not MANIFEST.is_file():
    raise SystemExit("FAIL source manifest is missing; run scripts/source_manifest.py first")

manifest = json.loads(MANIFEST.read_text())
files = manifest.get("files")
if not isinstance(files, dict) or not files:
    raise SystemExit("FAIL source manifest has no files")

issues: list[str] = []
conflict_markers = (b"<<<<<<< ", b"=======", b">>>>>>> ")

for rel in sorted(files):
    path = ROOT / rel
    if not path.is_file():
        issues.append(f"{rel}: missing manifested file")
        continue

    data = path.read_bytes()
    if b"\x00" in data:
        issues.append(f"{rel}: unexpected NUL byte")
        continue

    for line_no, raw_line in enumerate(data.splitlines(keepends=True), start=1):
        body = raw_line.rstrip(b"\r\n")
        if body.endswith((b" ", b"\t")):
            issues.append(f"{rel}:{line_no}: trailing whitespace")
        stripped = body.lstrip()
        if any(stripped.startswith(marker) for marker in conflict_markers):
            issues.append(f"{rel}:{line_no}: unresolved merge-conflict marker")

if issues:
    print("FAIL repository-independent whitespace/source hygiene")
    for issue in issues:
        print(f"  {issue}")
    raise SystemExit(1)

print(f"PASS whitespace/source hygiene across {len(files)} manifested files")
