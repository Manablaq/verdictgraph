#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="24.20.0"
NPM_VERSION="11.19.0"
NVM_VERSION="v0.40.7"
GENLAYER_JS_COMMIT="1b7f50a3a3f2963ea857941b0fb386081dd5c326"

printf '%s\n' "=== VerdictGraph Stage 3: frontend reproducible production build ==="
printf 'Repository: %s\n' "$ROOT"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "=== Installing pinned nvm ${NVM_VERSION} ==="
  PROFILE=/dev/null curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi
# nvm.sh defaults to auto-using .nvmrc when sourced. On a clean machine the
# pinned Node version is not installed yet, so that implicit `nvm use` returns
# non-zero and trips this script's `set -e` before `nvm install` can run.
# Source nvm in its documented no-auto-use mode, then install/use explicitly.
printf '%s\n' "=== Loading pinned nvm without auto-use ==="
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh" --no-use
command -v nvm >/dev/null 2>&1 || { echo "FAIL nvm did not load from $NVM_DIR/nvm.sh"; exit 1; }

# nvm deliberately rejects a user ~/.npmrc containing prefix/globalconfig.
# Never mutate the user's npm policy to satisfy a project verification run:
# isolate it only for the nvm activation window, restore the exact file on
# success or failure, and keep all later npm commands scoped to this repo.
USER_NPMRC="$HOME/.npmrc"
NPMRC_STASH_DIR=""
NPMRC_STASHED=0

restore_user_npmrc() {
  if [[ "$NPMRC_STASHED" -eq 1 ]]; then
    if [[ -e "$USER_NPMRC" || -L "$USER_NPMRC" ]]; then
      mv "$USER_NPMRC" "$NPMRC_STASH_DIR/.npmrc.created-during-verification"
      printf '%s\n' "WARN a new ~/.npmrc appeared during nvm activation; preserved it at $NPMRC_STASH_DIR/.npmrc.created-during-verification" >&2
    fi
    mv "$NPMRC_STASH_DIR/.npmrc" "$USER_NPMRC"
    NPMRC_STASHED=0
    if [[ ! -e "$NPMRC_STASH_DIR/.npmrc.created-during-verification" ]]; then
      rmdir "$NPMRC_STASH_DIR"
      NPMRC_STASH_DIR=""
    fi
    printf '%s\n' "Restored original ~/.npmrc after nvm activation"
  fi
}
trap restore_user_npmrc EXIT

# nvm also rejects NPM_CONFIG_PREFIX regardless of case. Any environment
# cleanup here is confined to this child verification shell and cannot change
# the caller's terminal environment.
while IFS='=' read -r config_name _; do
  # macOS ships Bash 3.2, which does not support Bash 4's ${var^^}
  # uppercase expansion. Normalize portably instead.
  config_name_upper="$(printf '%s' "$config_name" | LC_ALL=C tr '[:lower:]' '[:upper:]')"
  case "$config_name_upper" in
    NPM_CONFIG_PREFIX|NPM_CONFIG_GLOBALCONFIG) unset "$config_name" ;;
  esac
done < <(env)

if [[ -e "$USER_NPMRC" || -L "$USER_NPMRC" ]]; then
  NPMRC_STASH_DIR="$(mktemp -d "$HOME/.verdictgraph-npmrc.XXXXXX")"
  mv "$USER_NPMRC" "$NPMRC_STASH_DIR/.npmrc"
  NPMRC_STASHED=1
  printf '%s\n' "Temporarily isolated ~/.npmrc for nvm activation"
fi

printf '%s\n' "=== Installing/activating Node ${NODE_VERSION} ==="
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"
restore_user_npmrc
trap - EXIT

# Ignore personal npm user configuration for the project build. npm will use
# the repository's committed policy file for this verification process.
export NPM_CONFIG_USERCONFIG="$ROOT/.npmrc"

ACTUAL_NODE="$(node --version)"
ACTUAL_NPM="$(npm --version)"
[[ "$ACTUAL_NODE" == "v${NODE_VERSION}" ]] || { echo "FAIL expected Node v${NODE_VERSION}, got ${ACTUAL_NODE}"; exit 1; }
[[ "$ACTUAL_NPM" == "$NPM_VERSION" ]] || { echo "FAIL expected npm ${NPM_VERSION}, got ${ACTUAL_NPM}"; exit 1; }
printf 'Node: %s\nnpm:  %s\n' "$ACTUAL_NODE" "$ACTUAL_NPM"

printf '%s\n' "=== Cleaning generated frontend outputs ==="
rm -rf frontend/.next
rm -f frontend/tsconfig.tsbuildinfo
if git ls-files --error-unmatch frontend/tsconfig.tsbuildinfo >/dev/null 2>&1; then
  echo "Removing generated frontend/tsconfig.tsbuildinfo from the git index"
  git rm -f --cached --ignore-unmatch frontend/tsconfig.tsbuildinfo >/dev/null
fi

printf '%s\n' "=== Dependency install ==="
if [[ -f package-lock.json ]]; then
  echo "package-lock.json present: using npm ci"
  rm -rf node_modules frontend/node_modules
  npm ci
else
  echo "package-lock.json absent: bootstrapping exact lock with npm install"
  rm -rf node_modules frontend/node_modules
  npm install
fi

printf '%s\n' "=== Lockfile provenance checks ==="
node <<'NODE'
const fs = require('fs')
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const expected = new Map([
  ['node_modules/next', '16.3.4'],
  ['node_modules/react', '19.2.8'],
  ['node_modules/react-dom', '19.2.8'],
  ['node_modules/viem', '2.56.3'],
])
for (const [path, version] of expected) {
  const entry = lock.packages?.[path]
  if (!entry || entry.version !== version) {
    throw new Error(`Lock mismatch for ${path}: expected ${version}, got ${entry?.version ?? 'missing'}`)
  }
  console.log(`PASS ${path} = ${version}`)
}
const sdk = lock.packages?.['node_modules/genlayer-js']
if (!sdk) throw new Error('genlayer-js missing from root lockfile')
const resolved = String(sdk.resolved ?? '')
const commit = '1b7f50a3a3f2963ea857941b0fb386081dd5c326'
if (!resolved.includes(commit)) {
  throw new Error(`genlayer-js lock entry is not bound to ${commit}: ${resolved || 'no resolved field'}`)
}
console.log(`PASS genlayer-js resolved to exact commit ${commit}`)
NODE

printf '%s\n' "=== Installed dependency surface ==="
npm ls --workspace verdictgraph-web --depth=0

printf '%s\n' "=== TypeScript validation ==="
npm run lint

printf '%s\n' "=== Next.js production build ==="
npm run build

printf '%s\n' "=== Production dependency audit (high/critical gate) ==="
npm audit --omit=dev --audit-level=high

printf '%s\n' "=== Generated-cache hygiene ==="
rm -f frontend/tsconfig.tsbuildinfo
if git ls-files --error-unmatch frontend/tsconfig.tsbuildinfo >/dev/null 2>&1; then
  echo "FAIL frontend/tsconfig.tsbuildinfo is still tracked by git"
  exit 1
fi

printf '%s\n' "=== Recursive source manifest ==="
python3 scripts/source_manifest.py
python3 scripts/verify_manifest.py

printf '%s\n' "=== Reviewer gates ==="
python3 scripts/reviewer_gate.py

printf '%s\n' "=== Core/Vault ABI gate ==="
python3 scripts/abi_surface_gate.py

printf '%s\n' "=== Whitespace/source hygiene ==="
python3 scripts/whitespace_gate.py
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '%s\n' "=== Git diff whitespace check ==="
  git -C "$ROOT" diff --check
else
  printf '%s\n' "INFO no .git worktree present; recursive manifest hygiene gate is authoritative for this ZIP workspace"
fi

printf '%s\n' "=== STAGE 3 PASS ==="
