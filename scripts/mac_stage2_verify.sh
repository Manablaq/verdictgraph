#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '%s\n' "=== VerdictGraph Stage 2: macOS Solidity Vault verification ==="
printf '%s\n' "Repository: $ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "STOP: this Stage 2 helper is intended for macOS."
  exit 1
fi

export PATH="$HOME/.foundry/bin:$PATH"

if ! command -v foundryup >/dev/null 2>&1; then
  echo "=== Installing official foundryup ==="
  curl --proto '=https' --tlsv1.2 -L https://getfoundry.sh/install | bash
  export PATH="$HOME/.foundry/bin:$PATH"
fi

if ! command -v foundryup >/dev/null 2>&1; then
  echo "STOP: foundryup was not found after installation."
  exit 1
fi

echo "=== Installing pinned Foundry v1.8.1 ==="
foundryup --install v1.8.1
foundryup --use v1.8.1

FORGE_VERSION="$(forge --version | head -n 1)"
echo "$FORGE_VERSION"
if [[ "$FORGE_VERSION" != *"1.8.1"* ]]; then
  echo "STOP: expected Foundry/Forge v1.8.1."
  exit 1
fi

echo "=== Resolved Foundry configuration ==="
forge config | grep -E '^(src|test|solc|solc_version|optimizer|optimizer_runs)' || true

echo "=== Solidity compile ==="
forge build --force --sizes

echo "=== Vault tests ==="
forge test -vvv

echo "=== Solidity formatting check ==="
forge fmt --check

echo "=== Reviewer gates ==="
python3 scripts/reviewer_gate.py

echo "=== Core/Vault ABI gate ==="
python3 scripts/abi_surface_gate.py

echo "=== Source integrity ==="
python3 scripts/verify_manifest.py

echo "=== STAGE 2 PASS ==="
