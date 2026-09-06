#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
DEPLOYER="0x1f87ae197af539253978d435ad45ccf28fb95024"
REGISTRY_DEPLOY="contracts/verdict_graph_registry_deploy.py"
ADJUDICATOR_DEPLOY="contracts/verdict_graph_adjudicator_deploy.py"
NODE_VERSION="24.20.0"
NPM_VERSION="11.19.0"
MAX_SPLIT_DEPLOY_BYTES=56000
FOUNDRY_VERSION="v1.8.1"
VAULT_TARGET="evm/contracts/VerdictGraphVault.sol:VerdictGraphVault"

printf '%s\n' "=== VerdictGraph Stage 4E: split architecture verification ==="
printf 'Repository: %s\n' "$ROOT"
printf '%s\n' "NO PRIVATE KEY. NO SIGNATURE. NO TRANSACTION SUBMISSION."
[[ "$(uname -s)" == "Darwin" ]] || { echo "STOP: Stage 4E verifier is intended for macOS."; exit 1; }

printf '%s\n' "=== Build deterministic split deployment artifacts ==="
python3 scripts/build_stage4e_split_deploy_artifacts.py
for f in "$REGISTRY_DEPLOY" "$ADJUDICATOR_DEPLOY"; do
  python3 -m py_compile "$f"
  bytes="$(wc -c < "$f" | tr -d ' ')"
  echo "$f bytes=$bytes sha256=$(shasum -a 256 "$f" | awk '{print $1}')"
  [[ "$bytes" -le "$MAX_SPLIT_DEPLOY_BYTES" ]] || { echo "STOP: $f exceeds Stage 4E deploy-size ceiling"; exit 1; }
done

printf '%s\n' "=== Re-verify both split ICs in pinned GenVM runtime ==="
[[ -x .venv/bin/python ]] || { echo "STOP: Stage 1 .venv is missing."; exit 1; }
# shellcheck disable=SC1091
source .venv/bin/activate
python --version
printf '%s\n' "=== Direct helper pre-deploy independence gate ==="
python - <<'PYADDR'
from tests.direct.conftest import to_hex

raw = bytes.fromhex("ab" * 20)
expected = "0x" + "ab" * 20
assert to_hex(raw) == expected
assert to_hex(bytearray(raw)) == expected
assert to_hex(memoryview(raw)) == expected
assert to_hex("0x" + "AB" * 20) == expected

class AddressLike:
    as_hex = "0x" + "CD" * 20

assert to_hex(AddressLike()) == "0x" + "cd" * 20

for bad in (b"\x00" * 19, "0x1234", "not-an-address"):
    try:
        to_hex(bad)
    except (TypeError, ValueError):
        pass
    else:
        raise SystemExit(f"STOP: to_hex accepted invalid address: {bad!r}")

print("PASS Direct address helper is SDK-independent before first deploy")
PYADDR

printf '%s\n' "=== Bradbury constructor Address-calldata compatibility regression ==="
python - <<'PYBRADBURYADDR'
from pathlib import Path

from gltest.direct.sdk_loader import setup_sdk_paths

contract = Path("contracts/verdict_graph_adjudicator_deploy.py")
setup_sdk_paths(contract)

from genlayer.py import calldata
from genlayer.py.types import Address

registry_hex = "0x65c4acaD8Cfa4a531B5459e7C1f109443734860F"

original = Address(registry_hex)
encoded = calldata.encode({"args": [original]})
decoded = calldata.decode(encoded)["args"][0]

if not isinstance(decoded, Address):
    raise SystemExit(
        f"STOP: constructor calldata no longer decodes to Address; got {type(decoded)!r}"
    )

if str(decoded).lower() != registry_hex.lower():
    raise SystemExit("STOP: decoded Registry Address changed value")

try:
    Address(decoded)
except TypeError as exc:
    expected = "cannot convert 'Address' object to bytes"
    if expected not in str(exc):
        raise SystemExit(
            f"STOP: old constructor failed differently than Stage 4F: {exc}"
        ) from exc
    print(f"PASS old constructor failure reproduced: {type(exc).__name__}: {exc}")
else:
    raise SystemExit(
        "STOP: Address(Address) unexpectedly succeeded; "
        "Stage 4F failure model no longer matches the pinned SDK"
    )

normalized = Address(str(decoded))

if normalized.as_hex.lower() != registry_hex.lower():
    raise SystemExit("STOP: Address(str(Address)) changed Registry value")

print("PASS corrected constructor safely normalizes real Address calldata")
PYBRADBURYADDR

printf '%s\n' "=== Adjudicator constructor source regression gate ==="
python - <<'PYADJAST'
import ast
from pathlib import Path

expected = "Address(str(registry_address))"

for path in (
    Path("contracts/verdict_graph_adjudicator.py"),
    Path("contracts/verdict_graph_adjudicator_deploy.py"),
):
    tree = ast.parse(path.read_text())

    contract = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.ClassDef)
            and node.name == "VerdictGraphAdjudicator"
        ),
        None,
    )
    if contract is None:
        raise SystemExit(f"STOP: VerdictGraphAdjudicator missing from {path}")

    constructor = next(
        (
            node
            for node in contract.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "__init__"
        ),
        None,
    )
    if constructor is None:
        raise SystemExit(f"STOP: __init__ missing from {path}")

    assignment = next(
        (
            node
            for node in constructor.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name)
                and target.id == "registry"
                for target in node.targets
            )
        ),
        None,
    )
    if assignment is None:
        raise SystemExit(
            f"STOP: Registry normalization assignment missing from {path}"
        )

    actual = ast.unparse(assignment.value)

    if actual != expected:
        raise SystemExit(
            f"STOP: constructor regression in {path}: "
            f"expected {expected!r}, got {actual!r}"
        )

    print(f"PASS {path}: {actual}")

print("PASS canonical + deploy constructor normalization locked")
PYADJAST

genvm-lint typecheck "$REGISTRY_DEPLOY"
genvm-lint check "$REGISTRY_DEPLOY"
genvm-lint typecheck "$ADJUDICATOR_DEPLOY"
genvm-lint check "$ADJUDICATOR_DEPLOY"

printf '%s\n' "=== Direct Mode regression: canonical semantics ==="
python -m pytest \
  tests/direct/test_core_consensus.py \
  tests/direct/test_core_evidence.py \
  tests/direct/test_core_registry.py \
  tests/direct/test_core_response_and_liveness.py \
  -v

printf '%s\n' "=== Direct Mode split regression: Registry isolated process ==="
VERDICTGRAPH_SPLIT_DIRECT_ROLE=registry python -m pytest tests/direct/test_split_registry.py -v

printf '%s\n' "=== Direct Mode split regression: Adjudicator isolated process ==="
VERDICTGRAPH_SPLIT_DIRECT_ROLE=adjudicator python -m pytest tests/direct/test_split_adjudicator.py -v
printf '%s\n' "PASS Direct Mode total = 35 canonical + 2 Registry + 3 Adjudicator = 40 tests"

printf '%s\n' "=== Dual-controller Vault re-verification ==="
export PATH="$HOME/.foundry/bin:$PATH"
command -v foundryup >/dev/null 2>&1 || { echo "STOP: foundryup missing; Stage 2 must remain reproducible."; exit 1; }
foundryup --use "$FOUNDRY_VERSION" >/dev/null
FORGE_VERSION="$(forge --version | sed -n '1p')"
echo "$FORGE_VERSION"
[[ "$FORGE_VERSION" == "forge Version: 1.8.1" ]] || { echo "STOP: expected Foundry forge 1.8.1"; exit 1; }
forge fmt
forge build --force --sizes
forge test -vvv
forge fmt --check

printf '%s\n' "=== Dual-controller Vault bytecode identity ==="
CREATION_BYTECODE="$(forge inspect "$VAULT_TARGET" bytecode)"
RUNTIME_BYTECODE="$(forge inspect "$VAULT_TARGET" deployedBytecode)"
python3 - "$CREATION_BYTECODE" "$RUNTIME_BYTECODE" <<'PYHASH'
import hashlib, sys
for name, value in (("creation", sys.argv[1]), ("runtime", sys.argv[2])):
    if not value.startswith("0x"):
        raise SystemExit(f"STOP: Vault {name} bytecode missing 0x prefix")
    raw = bytes.fromhex(value[2:])
    if not raw:
        raise SystemExit(f"STOP: Vault {name} bytecode is empty")
    print(f"VAULT_{name.upper()}_BYTES={len(raw)}")
    print(f"VAULT_{name.upper()}_SHA256={hashlib.sha256(raw).hexdigest()}")
PYHASH

printf '%s\n' "=== Load exact Node runtime used by pinned GenLayerJS ==="
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] || { echo "STOP: nvm is missing; Stage 3 must remain reproducible."; exit 1; }
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh" --no-use
USER_NPMRC="$HOME/.npmrc"; NPMRC_STASH_DIR=""; NPMRC_STASHED=0
restore_user_npmrc() {
  if [[ "$NPMRC_STASHED" -eq 1 ]]; then
    [[ -e "$USER_NPMRC" || -L "$USER_NPMRC" ]] && mv "$USER_NPMRC" "$NPMRC_STASH_DIR/.npmrc.created-during-verification"
    mv "$NPMRC_STASH_DIR/.npmrc" "$USER_NPMRC"; NPMRC_STASHED=0
    [[ -e "$NPMRC_STASH_DIR/.npmrc.created-during-verification" ]] || rmdir "$NPMRC_STASH_DIR" || true
  fi
}
trap restore_user_npmrc EXIT
while IFS='=' read -r config_name _; do
  config_name_upper="$(printf '%s' "$config_name" | LC_ALL=C tr '[:lower:]' '[:upper:]')"
  case "$config_name_upper" in NPM_CONFIG_PREFIX|NPM_CONFIG_GLOBALCONFIG) unset "$config_name" ;; esac
done < <(env)
if [[ -e "$USER_NPMRC" || -L "$USER_NPMRC" ]]; then
  NPMRC_STASH_DIR="$(mktemp -d "$HOME/.verdictgraph-npmrc.XXXXXX")"; mv "$USER_NPMRC" "$NPMRC_STASH_DIR/.npmrc"; NPMRC_STASHED=1
fi
nvm use "$NODE_VERSION" >/dev/null
restore_user_npmrc; trap - EXIT
export NPM_CONFIG_USERCONFIG="$ROOT/.npmrc"
[[ "$(node --version)" == "v${NODE_VERSION}" ]] || { echo "STOP: Node version drift"; exit 1; }
[[ "$(npm --version)" == "$NPM_VERSION" ]] || { echo "STOP: npm version drift"; exit 1; }
[[ -d node_modules/genlayer-js ]] || { echo "STOP: Stage 3 node_modules missing."; exit 1; }

printf '%s\n' "=== LIVE BRADBURY DEPLOYMENT ESTIMATES — BOTH NO SEND ==="
for spec in "$REGISTRY_DEPLOY registry" "$ADJUDICATOR_DEPLOY adjudicator"; do
  set -- $spec
  VERDICTGRAPH_DEPLOYER="$DEPLOYER" node scripts/stage4e_split_deploy_estimate.mjs "$1" "$2"
done

printf '%s\n' "=== Final source / reviewer / ABI / hygiene gates ==="
python scripts/source_manifest.py
python scripts/verify_manifest.py
python scripts/reviewer_gate.py
python scripts/abi_surface_gate.py
python scripts/whitespace_gate.py

printf '%s\n' "=== STAGE 4E PASS ==="
printf '%s\n' "Both split IC deployment payloads passed Bradbury eth_estimateGas with sends blocked; GenVM, Direct Mode, and dual-controller Vault verification passed."
printf '%s\n' "DO NOT DEPLOY YET."
