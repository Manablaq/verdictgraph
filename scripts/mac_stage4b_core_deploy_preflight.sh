#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPECTED_CHAIN_ID_DEC=4221
EXPECTED_CHAIN_ID_HEX="0x107d"
GENLAYER_RPC="https://rpc-bradbury.genlayer.com"
CHAIN_RPC="https://rpc.testnet-chain.genlayer.com"
EXPECTED_GENLAYER_CLI="0.39.2"
FOUNDRY_VERSION="v1.8.1"
VAULT_TARGET="evm/contracts/VerdictGraphVault.sol:VerdictGraphVault"
EXPECTED_VAULT_CREATION_SHA256="0956176b1a1e64c69a1618fcb9bc31ab9b15774330e4d1feec62bce0139e4599"
EXPECTED_VAULT_RUNTIME_SHA256="cbf65e327170b32110859713c577fe62a1993ce2b811258962ebf3f9a70507e0"
PREFLIGHT_RECORD="verification/bradbury-deployment-preflight.json"

printf '%s\n' "=== VerdictGraph Stage 4B: Bradbury Core deployment preflight ==="
printf '%s\n' "Repository: $ROOT"
printf '%s\n' "Read-only preflight: no private key is requested, no transaction is signed, and nothing is deployed."

for cmd in curl python3 genlayer foundryup forge; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "FAIL required command missing: $cmd"
    if [[ "$cmd" == "genlayer" ]]; then
      echo "Install the pinned stable CLI with: npm install -g genlayer@$EXPECTED_GENLAYER_CLI"
    fi
    exit 1
  fi
done

rpc_call() {
  local url="$1"
  local method="$2"
  local params_json="$3"
  curl --fail --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params_json}}" \
    "$url"
}

json_result() {
  python3 -c 'import json,sys; obj=json.load(sys.stdin); err=obj.get("error"); sys.exit("RPC error: "+json.dumps(err,sort_keys=True)) if err else print(obj.get("result", ""))'
}

printf '%s\n' "=== Bradbury chain identity ==="
for endpoint in "$GENLAYER_RPC" "$CHAIN_RPC"; do
  CHAIN_ID="$(rpc_call "$endpoint" eth_chainId '[]' | json_result)"
  if [[ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID_HEX" ]]; then
    echo "FAIL $endpoint chain id: expected $EXPECTED_CHAIN_ID_HEX, got ${CHAIN_ID:-<empty>}"
    exit 1
  fi
  echo "PASS $endpoint = chain $EXPECTED_CHAIN_ID_DEC"
done

printf '%s\n' "=== GenLayer CLI identity ==="
CLI_VERSION_RAW="$(genlayer --version 2>&1 || true)"
echo "$CLI_VERSION_RAW"
if ! printf '%s\n' "$CLI_VERSION_RAW" | grep -Eq '(^|[^0-9])0\.39\.2([^0-9]|$)'; then
  echo "FAIL expected GenLayer CLI $EXPECTED_GENLAYER_CLI"
  echo "Do not deploy with a different CLI release family."
  exit 1
fi
echo "PASS GenLayer CLI = $EXPECTED_GENLAYER_CLI"

NETWORKS="$(genlayer network list 2>&1)"
if ! printf '%s\n' "$NETWORKS" | grep -q 'testnet-bradbury'; then
  echo "FAIL CLI does not expose built-in testnet-bradbury network"
  exit 1
fi
echo "PASS CLI exposes testnet-bradbury"

printf '%s\n' "=== Active deployer account (read-only) ==="
ACCOUNT_OUTPUT="$(genlayer account show --rpc "$GENLAYER_RPC" 2>&1)" || {
  printf '%s\n' "$ACCOUNT_OUTPUT"
  echo "FAIL no usable active GenLayer CLI account. Configure/import an account in the CLI before deployment."
  exit 1
}
printf '%s\n' "$ACCOUNT_OUTPUT"
DEPLOYER_ADDRESS="$(printf '%s\n' "$ACCOUNT_OUTPUT" | python3 -c 'import re,sys; t=sys.stdin.read(); m=re.search(r"0x[a-fA-F0-9]{40}", t); print(m.group(0) if m else "")')"
if [[ -z "$DEPLOYER_ADDRESS" ]]; then
  echo "FAIL could not extract the active account address from genlayer account show"
  exit 1
fi

BALANCE_HEX="$(rpc_call "$GENLAYER_RPC" eth_getBalance "[\"$DEPLOYER_ADDRESS\",\"latest\"]" | json_result)"
BALANCE_WEI="$(python3 - "$BALANCE_HEX" <<'PY'
import sys
try:
    print(int(sys.argv[1], 16))
except Exception as exc:
    raise SystemExit(f"FAIL invalid balance {sys.argv[1]!r}: {exc}")
PY
)"
python3 - "$DEPLOYER_ADDRESS" "$BALANCE_WEI" <<'PY'
from decimal import Decimal
import sys
address, raw = sys.argv[1], int(sys.argv[2])
print(f"PASS deployer address = {address}")
print(f"PASS deployer balance = {Decimal(raw) / Decimal(10**18)} GEN ({raw} wei)")
if raw <= 0:
    raise SystemExit("FAIL deployer has zero GEN; fund the account from the Bradbury faucet before deployment")
PY

printf '%s\n' "=== Deterministic source identity ==="
python3 scripts/source_manifest.py
python3 scripts/verify_manifest.py
SOURCE_SET_SHA256="$(python3 -c 'import json; print(json.load(open("verification/source-manifest.json"))["source_set_sha256"])')"
CORE_SOURCE_SHA256="$(python3 -c 'import hashlib; print(hashlib.sha256(open("contracts/verdict_graph_core.py","rb").read()).hexdigest())')"
echo "SOURCE_SET_SHA256=$SOURCE_SET_SHA256"
echo "CORE_SOURCE_SHA256=$CORE_SOURCE_SHA256"

python3 - <<'PY'
from pathlib import Path
core = Path('contracts/verdict_graph_core.py').read_text()
if 'def __init__(self):' not in core:
    raise SystemExit('FAIL Core constructor missing')
constructor = core.split('def __init__(self):', 1)[1].split('\n    def ', 1)[0]
if 'self.owner = gl.message.sender_address' not in constructor or 'self.vault_address = ZERO_ADDRESS' not in constructor:
    raise SystemExit('FAIL Core constructor deployment invariants changed')
print('PASS Core constructor has no arguments and initializes owner/unbound Vault')
PY

printf '%s\n' "=== Exact Vault artifact continuity ==="
foundryup --use "$FOUNDRY_VERSION" >/dev/null
forge build --force >/dev/null
CREATION_BYTECODE="$(forge inspect "$VAULT_TARGET" bytecode)"
RUNTIME_BYTECODE="$(forge inspect "$VAULT_TARGET" deployedBytecode)"
read -r CREATION_SHA RUNTIME_SHA <<EOF
$(python3 - "$CREATION_BYTECODE" "$RUNTIME_BYTECODE" <<'PY'
import hashlib, sys
out=[]
for value in sys.argv[1:]:
    if not value.startswith('0x'):
        raise SystemExit('FAIL bytecode missing 0x prefix')
    out.append(hashlib.sha256(bytes.fromhex(value[2:])).hexdigest())
print(*out)
PY
)
EOF
if [[ "$CREATION_SHA" != "$EXPECTED_VAULT_CREATION_SHA256" ]]; then
  echo "FAIL Vault creation bytecode drift: $CREATION_SHA"
  exit 1
fi
if [[ "$RUNTIME_SHA" != "$EXPECTED_VAULT_RUNTIME_SHA256" ]]; then
  echo "FAIL Vault runtime bytecode drift: $RUNTIME_SHA"
  exit 1
fi
echo "PASS Vault creation SHA-256 = $CREATION_SHA"
echo "PASS Vault runtime SHA-256 = $RUNTIME_SHA"

printf '%s\n' "=== Write immutable preflight record ==="
mkdir -p verification
python3 - "$PREFLIGHT_RECORD" "$SOURCE_SET_SHA256" "$CORE_SOURCE_SHA256" "$CREATION_SHA" "$RUNTIME_SHA" "$DEPLOYER_ADDRESS" "$BALANCE_WEI" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path
path, source_set, core_sha, creation_sha, runtime_sha, deployer, balance = sys.argv[1:]
record = {
    'schema': 'verdictgraph-bradbury-core-preflight-v1',
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'network': 'bradbury',
    'chainId': 4221,
    'genlayerRpc': 'https://rpc-bradbury.genlayer.com',
    'genlayerChainRpc': 'https://rpc.testnet-chain.genlayer.com',
    'genlayerCli': '0.39.2',
    'sourceSetSha256': source_set,
    'coreSourceSha256': core_sha,
    'vaultCreationSha256': creation_sha,
    'vaultRuntimeSha256': runtime_sha,
    'deployerAddress': deployer,
    'deployerBalanceWeiAtPreflight': balance,
    'coreAddress': None,
    'coreDeployTransaction': None,
}
Path(path).write_text(json.dumps(record, indent=2) + '\n')
print(path)
PY

printf '%s\n' "=== Reviewer/source gates ==="
python3 scripts/reviewer_gate.py
python3 scripts/abi_surface_gate.py
python3 scripts/whitespace_gate.py

printf '%s\n' "=== CORE DEPLOY COMMAND (DO NOT RUN UNTIL NEXT STEP) ==="
printf '%s\n' "genlayer network set testnet-bradbury"
printf '%s\n' "genlayer network info"
printf '%s\n' "genlayer deploy --contract contracts/verdict_graph_core.py"
printf '%s\n' "The deploy command is intentionally not executed by this preflight."
printf '%s\n' "=== STAGE 4B PREFLIGHT PASS ==="
