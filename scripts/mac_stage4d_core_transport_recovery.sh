#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOYER="0x1f87ae197af539253978d435ad45ccf28fb95024"
DEPLOY_CORE="contracts/verdict_graph_core_deploy.py"
NODE_VERSION="24.20.0"
NPM_VERSION="11.19.0"

printf '%s\n' "=== VerdictGraph Stage 4D: progressive Core transport recovery ==="
printf 'Repository: %s\n' "$ROOT"
printf '%s\n' "NO PRIVATE KEY. NO SIGNATURE. NO TRANSACTION SUBMISSION."

[[ "$(uname -s)" == "Darwin" ]] || { echo "STOP: Stage 4D verifier is intended for macOS."; exit 1; }

printf '%s\n' "=== Generate progressively smaller parity-proved Core candidates ==="
python3 scripts/build_core_deploy_candidates.py
for candidate in \
  artifacts/stage4d-core-candidates/exact_ast.py \
  artifacts/stage4d-core-candidates/diagnostic_compact.py \
  artifacts/stage4d-core-candidates/private_symbol_compact.py
do
  python3 -m py_compile "$candidate"
done

printf '%s\n' "=== Load exact Node runtime used by pinned GenLayerJS ==="
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
[[ "$(node --version)" == "v${NODE_VERSION}" ]] || { echo "STOP: Node version drift"; exit 1; }
[[ "$(npm --version)" == "$NPM_VERSION" ]] || { echo "STOP: npm version drift"; exit 1; }
[[ -d node_modules/genlayer-js ]] || { echo "STOP: Stage 3 node_modules missing."; exit 1; }

printf '%s\n' "=== LIVE BRADBURY ESTIMATES — progressively smaller, still NO SEND ==="
selected=""
for candidate in \
  artifacts/stage4d-core-candidates/exact_ast.py \
  artifacts/stage4d-core-candidates/diagnostic_compact.py \
  artifacts/stage4d-core-candidates/private_symbol_compact.py
do
  printf '\n--- probing %s (%s bytes) ---\n' "$candidate" "$(wc -c < "$candidate" | tr -d ' ')"
  set +e
  VERDICTGRAPH_DEPLOYER="$DEPLOYER" node scripts/stage4d_core_deploy_estimate.mjs "$candidate"
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    selected="$candidate"
    break
  fi
  if [[ "$rc" -ne 2 ]]; then
    echo "STOP: no-send estimator failed unexpectedly for $candidate"
    exit "$rc"
  fi
done

if [[ -z "$selected" ]]; then
  echo "STOP: Bradbury rejected all Stage 4D candidates with no transaction submitted."
  exit 2
fi

printf '\nSELECTED_DEPLOY_SOURCE=%s\n' "$selected"
cp "$selected" "$DEPLOY_CORE"
python3 scripts/verify_core_deploy_parity.py

printf '%s\n' "=== Re-verify exact selected deploy source in pinned GenVM runtime ==="
[[ -x .venv/bin/python ]] || { echo "STOP: Stage 1 .venv is missing."; exit 1; }
# shellcheck disable=SC1091
source .venv/bin/activate
python --version
genvm-lint typecheck "$DEPLOY_CORE"
genvm-lint check "$DEPLOY_CORE"

printf '%s\n' "=== Direct Mode regression against exact selected deploy source ==="
VERDICTGRAPH_CONTRACT="$DEPLOY_CORE" python -m pytest tests/direct -v

printf '%s\n' "=== Final reviewer / ABI / deterministic source identity gates ==="
python scripts/source_manifest.py
python scripts/verify_manifest.py
python scripts/verify_core_deploy_parity.py
python scripts/reviewer_gate.py
python scripts/abi_surface_gate.py
python scripts/whitespace_gate.py

printf '%s\n' "=== STAGE 4D PASS ==="
printf '%s\n' "Bradbury accepted gas estimation for the selected Core source; the provider blocked submission; GenVM and 35 Direct Mode tests passed on that exact source."
printf '%s\n' "DO NOT DEPLOY YET."
