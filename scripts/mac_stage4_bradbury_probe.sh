#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FOUNDRY_VERSION="v1.8.1"
EXPECTED_CHAIN_ID_DEC=4221
EXPECTED_CHAIN_ID_HEX="0x107d"
GENLAYER_RPC="https://rpc-bradbury.genlayer.com"
CHAIN_RPC="https://rpc.testnet-chain.genlayer.com"
MULTICALL3="0xcA11bde05977b3631167028862bE2a173976CA11"
VAULT_TARGET="evm/contracts/VerdictGraphVault.sol:VerdictGraphVault"
# Contract-creation initcode: PUSH0; PUSH1 0; MSTORE; PUSH1 32; PUSH1 0; RETURN.
# A chain that rejects EIP-3855/PUSH0 will fail this eth_call.
PUSH0_INITCODE="0x5f60005260206000f3"
EXPECTED_PUSH0_RESULT="0x0000000000000000000000000000000000000000000000000000000000000000"

printf '%s\n' "=== VerdictGraph Stage 4A: Bradbury EVM compatibility probe ==="
printf '%s\n' "Repository: $ROOT"
printf '%s\n' "No private key is read; this stage sends no transactions and spends no GEN."

for cmd in curl python3 foundryup forge cast; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "FAIL required command missing: $cmd"
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

check_chain_id() {
  local label="$1"
  local url="$2"
  local raw result
  raw="$(rpc_call "$url" eth_chainId '[]')"
  result="$(printf '%s' "$raw" | json_result)"
  if [[ "$result" != "$EXPECTED_CHAIN_ID_HEX" ]]; then
    echo "FAIL $label chain id: expected $EXPECTED_CHAIN_ID_HEX ($EXPECTED_CHAIN_ID_DEC), got ${result:-<empty>}"
    exit 1
  fi
  echo "PASS $label chain id = $result ($EXPECTED_CHAIN_ID_DEC)"
}

printf '%s\n' "=== Bradbury RPC identity ==="
check_chain_id "GenLayer RPC" "$GENLAYER_RPC"
check_chain_id "GenLayer Chain RPC" "$CHAIN_RPC"

LATEST_BLOCK_HEX="$(rpc_call "$CHAIN_RPC" eth_blockNumber '[]' | json_result)"
python3 - "$LATEST_BLOCK_HEX" <<'PY'
import sys
v=sys.argv[1]
try:
    n=int(v,16)
except Exception as exc:
    raise SystemExit(f"FAIL invalid eth_blockNumber result {v!r}: {exc}")
if n <= 0:
    raise SystemExit(f"FAIL non-positive Bradbury block number: {n}")
print(f"PASS Bradbury latest block = {n} ({v})")
PY

printf '%s\n' "=== EVM bytecode path ==="
MULTICALL_CODE="$(rpc_call "$CHAIN_RPC" eth_getCode "[\"$MULTICALL3\",\"latest\"]" | json_result)"
if [[ -z "$MULTICALL_CODE" || "$MULTICALL_CODE" == "0x" || "$MULTICALL_CODE" == "0x0" ]]; then
  echo "INFO Multicall3 predeploy is not present at $MULTICALL3; continuing with direct EVM initcode simulation"
else
  echo "PASS EVM code is present at Multicall3 $MULTICALL3"
fi

printf '%s\n' "=== PUSH0 / Shanghai live simulation ==="
PUSH0_RESULT="$(rpc_call "$CHAIN_RPC" eth_call "[{\"data\":\"$PUSH0_INITCODE\"},\"latest\"]" | json_result)"
if [[ "$PUSH0_RESULT" != "$EXPECTED_PUSH0_RESULT" ]]; then
  echo "FAIL PUSH0 creation simulation returned unexpected data: ${PUSH0_RESULT:-<empty>}"
  exit 1
fi
echo "PASS Bradbury executes PUSH0 creation initcode"

printf '%s\n' "=== Exact Foundry toolchain ==="
foundryup --use "$FOUNDRY_VERSION" >/dev/null
FORGE_VERSION="$(forge --version | sed -n '1p')"
echo "$FORGE_VERSION"
if [[ "$FORGE_VERSION" != "forge Version: 1.8.1" ]]; then
  echo "FAIL expected Foundry forge 1.8.1"
  exit 1
fi

printf '%s\n' "=== Vault compile ==="
forge build --force --sizes

CREATION_BYTECODE="$(forge inspect "$VAULT_TARGET" bytecode)"
RUNTIME_BYTECODE="$(forge inspect "$VAULT_TARGET" deployedBytecode)"
python3 - "$CREATION_BYTECODE" "$RUNTIME_BYTECODE" <<'PY'
import hashlib, sys
creation, runtime = sys.argv[1:]

def decode(name, value):
    if not value.startswith('0x'):
        raise SystemExit(f'FAIL {name} bytecode missing 0x prefix')
    raw=bytes.fromhex(value[2:])
    if not raw:
        raise SystemExit(f'FAIL {name} bytecode is empty')
    print(f'PASS {name} bytecode bytes = {len(raw)}')
    print(f'{name.upper()}_SHA256={hashlib.sha256(raw).hexdigest()}')
    return raw

creation_raw=decode('creation', creation)
runtime_raw=decode('runtime', runtime)
# Solidity appends CBOR metadata to runtime bytecode. Strip it before opcode scanning
# so arbitrary metadata bytes cannot be misclassified as opcodes.
if len(runtime_raw) < 2:
    raise SystemExit('FAIL runtime bytecode too short for metadata length')
metadata_len=int.from_bytes(runtime_raw[-2:], 'big')
if metadata_len + 2 > len(runtime_raw):
    raise SystemExit('FAIL invalid Solidity metadata length in runtime bytecode')
code=runtime_raw[:len(runtime_raw)-metadata_len-2]
print(f'PASS runtime executable bytes (metadata stripped) = {len(code)}')
open('/tmp/verdictgraph-vault-runtime-executable.hex','w').write('0x'+code.hex())
PY

printf '%s\n' "=== Vault executable opcode compatibility ==="
RUNTIME_OPCODES="$(cast disassemble "$(cat /tmp/verdictgraph-vault-runtime-executable.hex)")"
printf '%s\n' "$RUNTIME_OPCODES" > /tmp/verdictgraph-vault-runtime.opcodes
if grep -Eq '\b(CALLCODE|SELFDESTRUCT|BLOBHASH|BLOBBASEFEE)\b' /tmp/verdictgraph-vault-runtime.opcodes; then
  echo "FAIL Vault runtime contains an opcode documented as unsupported by the ZKsync EVM interpreter"
  grep -En '\b(CALLCODE|SELFDESTRUCT|BLOBHASH|BLOBBASEFEE)\b' /tmp/verdictgraph-vault-runtime.opcodes || true
  exit 1
fi
echo "PASS Vault runtime contains none of CALLCODE/SELFDESTRUCT/BLOBHASH/BLOBBASEFEE"
if grep -Eq '\bPUSH0\b' /tmp/verdictgraph-vault-runtime.opcodes; then
  echo "INFO Vault runtime uses PUSH0; live Bradbury PUSH0 simulation already passed"
else
  echo "INFO Vault runtime does not use PUSH0; Bradbury PUSH0 support was still independently verified"
fi

printf '%s\n' "=== Stage 4A deployment-order invariant ==="
python3 - <<'PY'
from pathlib import Path
core=Path('contracts/verdict_graph_core.py').read_text()
vault=Path('evm/contracts/VerdictGraphVault.sol').read_text()
checks={
    'Core initializes unbound Vault': 'self.vault_address = ZERO_ADDRESS' in core,
    'Core has one-way bind_vault': 'def bind_vault(self, vault_address: str)' in core and 'Vault is already bound' in core,
    'Core verifies Vault immutable back-reference': 'bound_core = VerdictGraphVault(vault).view().core()' in core and 'bound_core != gl.message.contract_address' in core,
    'Vault constructor binds exact Core': 'constructor(address core_)' in vault and 'core = core_;' in vault,
}
for name, ok in checks.items():
    if not ok:
        raise SystemExit(f'FAIL {name}')
    print(f'PASS {name}')
print('PASS deployment order is Core -> Vault(core) -> Core.bind_vault(vault)')
PY

rm -f /tmp/verdictgraph-vault-runtime-executable.hex /tmp/verdictgraph-vault-runtime.opcodes

printf '%s\n' "=== Source/reviewer integrity ==="
python3 scripts/source_manifest.py
python3 scripts/verify_manifest.py
python3 scripts/reviewer_gate.py
python3 scripts/abi_surface_gate.py
python3 scripts/whitespace_gate.py

printf '%s\n' "=== STAGE 4A PASS ==="
