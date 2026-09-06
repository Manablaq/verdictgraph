#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== VerdictGraph Stage 1: macOS GenLayer verification ==="
echo "Repository: $ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "STOP: this helper is intended for macOS (Darwin)."
  exit 1
fi

if ! command -v python3.12 >/dev/null 2>&1; then
  echo "STOP: python3.12 was not found."
  echo "Install Python 3.12, then rerun this script."
  echo "If you use Homebrew: brew install python@3.12"
  exit 1
fi

python3.12 --version

if [[ ! -d .venv ]]; then
  python3.12 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

python --version
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

echo
echo "=== Installed GenLayer toolchain ==="
python -m pip show genlayer-py genlayer-test genvm-linter | sed -n '1,120p'

echo
echo "=== GenVM typecheck ==="
genvm-lint typecheck contracts/verdict_graph_core.py

echo
echo "=== GenVM check ==="
genvm-lint check contracts/verdict_graph_core.py

echo
echo "=== Direct Mode tests ==="
python -m pytest tests/direct -v

echo
echo "=== Reviewer/source gates ==="
python scripts/reviewer_gate.py
python scripts/abi_surface_gate.py
python scripts/verify_manifest.py

echo
echo "STAGE 1 PASS: GenVM validation, Direct Mode tests, ABI gate, reviewer gates and source manifest all passed."
