#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_CORE="contracts/verdict_graph_core_deploy.py"
DEPLOYER="0x1f87ae197af539253978d435ad45ccf28fb95024"
NODE_VERSION="24.20.0"
NPM_VERSION="11.19.0"

printf '%s\n' "=== VerdictGraph Stage 4C recovery: compact Core + no-send Bradbury estimate ==="
printf 'Repository: %s\n' "$ROOT"
printf '%s\n' "This stage cannot sign or submit a transaction."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "STOP: this verifier is intended for macOS (Darwin)."
  exit 1
fi

printf '%s\n' "=== Build deterministic deployment artifact ==="
python3 scripts/build_core_deploy_artifact.py
python3 -m py_compile "$DEPLOY_CORE"

printf '%s\n' "=== Re-verify compact Core in pinned GenVM runtime ==="
if [[ ! -x .venv/bin/python ]]; then
  echo "STOP: .venv from Stage 1 is missing; do not deploy."
  exit 1
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python --version

genvm-lint typecheck "$DEPLOY_CORE"
genvm-lint check "$DEPLOY_CORE"

printf '%s\n' "=== Direct Mode regression against exact deployment artifact ==="
VERDICTGRAPH_CONTRACT="$DEPLOY_CORE" python -m pytest tests/direct -v

printf '%s\n' "=== Source/ABI gates before live estimate ==="
python scripts/reviewer_gate.py
python scripts/abi_surface_gate.py
python scripts/source_manifest.py
python scripts/verify_manifest.py
python scripts/whitespace_gate.py

printf '%s\n' "=== Exact Node runtime for pinned GenLayerJS ==="
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] || { echo "STOP: nvm is missing; Stage 3 must remain reproducible."; exit 1; }
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh" --no-use

USER_NPMRC="$HOME/.npmrc"
NPMRC_STASH_DIR=""
NPMRC_STASHED=0
restore_user_npmrc() {
  if [[ "$NPMRC_STASHED" -eq 1 ]]; then
    if [[ -e "$USER_NPMRC" || -L "$USER_NPMRC" ]]; then
      mv "$USER_NPMRC" "$NPMRC_STASH_DIR/.npmrc.created-during-verification"
    fi
    mv "$NPMRC_STASH_DIR/.npmrc" "$USER_NPMRC"
    NPMRC_STASHED=0
    if [[ ! -e "$NPMRC_STASH_DIR/.npmrc.created-during-verification" ]]; then
      rmdir "$NPMRC_STASH_DIR"
      NPMRC_STASH_DIR=""
    fi
  fi
}
trap restore_user_npmrc EXIT
while IFS='=' read -r config_name _; do
  config_name_upper="$(printf '%s' "$config_name" | LC_ALL=C tr '[:lower:]' '[:upper:]')"
  case "$config_name_upper" in
    NPM_CONFIG_PREFIX|NPM_CONFIG_GLOBALCONFIG) unset "$config_name" ;;
  esac
done < <(env)
if [[ -e "$USER_NPMRC" || -L "$USER_NPMRC" ]]; then
  NPMRC_STASH_DIR="$(mktemp -d "$HOME/.verdictgraph-npmrc.XXXXXX")"
  mv "$USER_NPMRC" "$NPMRC_STASH_DIR/.npmrc"
  NPMRC_STASHED=1
fi
nvm use "$NODE_VERSION" >/dev/null
restore_user_npmrc
trap - EXIT
export NPM_CONFIG_USERCONFIG="$ROOT/.npmrc"

[[ "$(node --version)" == "v${NODE_VERSION}" ]] || { echo "FAIL Node version drift"; exit 1; }
[[ "$(npm --version)" == "$NPM_VERSION" ]] || { echo "FAIL npm version drift"; exit 1; }
[[ -d node_modules/genlayer-js ]] || { echo "STOP: Stage 3 node_modules missing; run Stage 3 before this recovery verifier."; exit 1; }

printf '%s\n' "=== LIVE BRADBURY DEPLOYMENT ESTIMATE — NO SEND ==="
printf '%s\n' "Expected deployer: $DEPLOYER"
printf '%s\n' "The provider shim rejects every sign/send method before it can reach the RPC."
VERDICTGRAPH_DEPLOYER="$DEPLOYER" node scripts/stage4c_core_deploy_estimate.mjs "$DEPLOY_CORE"

printf '%s\n' "=== Refresh deterministic source identity after generated artifact ==="
python scripts/source_manifest.py
python scripts/verify_manifest.py
python scripts/reviewer_gate.py
python scripts/abi_surface_gate.py
python scripts/whitespace_gate.py

printf '%s\n' "=== STAGE 4C RECOVERY PASS ==="
printf '%s\n' "Compact Core passed GenVM, Direct Mode, reviewer/ABI/integrity gates, and live Bradbury eth_estimateGas without signing or sending."
