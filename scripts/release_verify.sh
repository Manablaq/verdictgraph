#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "== VerdictGraph release verification =="
python3 scripts/reviewer_gate.py
python3 scripts/abi_surface_gate.py
python3 scripts/verify_manifest.py
python3 scripts/whitespace_gate.py

npm run contract:typecheck
npm run contract:lint
PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/python -m pytest tests/direct -v

# Milestone verification exercises canonical + deployment IC artifacts,
# isolated Direct Mode roles, the milestone Vault suite and frontend build.
bash scripts/milestone_verify.sh

# Full deterministic Vault regression, not only the milestone subset.
forge test -vvv

npm --prefix frontend run lint
npm --prefix frontend run build
npm audit --omit=dev --audit-level=high

git diff --check
git diff --exit-code

echo "VERDICTGRAPH_RELEASE_VERIFY=PASS"
