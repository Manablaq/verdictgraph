#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOYER="${VERDICTGRAPH_DEPLOYER:?Set VERDICTGRAPH_DEPLOYER to the intended Bradbury deployer address}"
ACCEPTANCE_AUTHORITY="${VERDICTGRAPH_MILESTONE_ACCEPTANCE_AUTHORITY:?Set VERDICTGRAPH_MILESTONE_ACCEPTANCE_AUTHORITY to the immutable funded acceptance authority address}"
AUTHORITY_ADDRESS="${VERDICTGRAPH_MILESTONE_AUTHORITY_ADDRESS:-$DEPLOYER}"
REGISTRY_ADDRESS="${VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS:-$DEPLOYER}"
GENLAYER_RPC="https://rpc-bradbury.genlayer.com"
EXPECTED_GENLAYER_CLI="0.39.2"
GENLAYER_ACCOUNT="${VERDICTGRAPH_GENLAYER_ACCOUNT:-worker}"

[[ "$DEPLOYER" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "STOP: invalid VERDICTGRAPH_DEPLOYER"; exit 1; }
[[ "$ACCEPTANCE_AUTHORITY" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "STOP: invalid VERDICTGRAPH_MILESTONE_ACCEPTANCE_AUTHORITY"; exit 1; }
[[ "$AUTHORITY_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "STOP: invalid VERDICTGRAPH_MILESTONE_AUTHORITY_ADDRESS"; exit 1; }
[[ "$REGISTRY_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "STOP: invalid VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS"; exit 1; }

command -v genlayer >/dev/null 2>&1 || { echo "STOP: GenLayer CLI is missing"; exit 1; }
CLI_VERSION="$(genlayer --version 2>&1 || true)"
printf '%s\n' "$CLI_VERSION"
printf '%s\n' "$CLI_VERSION" | grep -Eq '(^|[^0-9])0\.39\.2([^0-9]|$)' || {
  echo "STOP: expected GenLayer CLI $EXPECTED_GENLAYER_CLI"; exit 1;
}
echo "PASS GenLayer CLI = $EXPECTED_GENLAYER_CLI"

NETWORKS="$(genlayer network list 2>&1)"
printf '%s\n' "$NETWORKS" | grep -q 'testnet-bradbury' || {
  echo "STOP: GenLayer CLI does not expose testnet-bradbury"; exit 1;
}
echo "PASS GenLayer CLI exposes testnet-bradbury"

ACCOUNT_OUTPUT="$(genlayer account show --account "$GENLAYER_ACCOUNT" --rpc "$GENLAYER_RPC" 2>&1)" || {
  printf '%s\n' "$ACCOUNT_OUTPUT"
  echo "STOP: configured GenLayer account could not be read"; exit 1;
}
printf '%s\n' "$ACCOUNT_OUTPUT"
printf '%s\n' "$ACCOUNT_OUTPUT" | grep -qi "$DEPLOYER" || {
  echo "STOP: configured account does not match VERDICTGRAPH_DEPLOYER"; exit 1;
}
echo "PASS active account $GENLAYER_ACCOUNT matches deployer $DEPLOYER"

printf '%s\n' "=== VerdictGraph split milestone Bradbury no-send preflight ==="
printf '%s\n' "No private key is read. No signature is requested. No transaction is submitted."
python3 scripts/build_milestone_deploy_artifact.py
python3 scripts/milestone_gate.py
PYTHONPYCACHEPREFIX=/private/tmp/verdictgraph-pycache python3 -m py_compile \
  contracts/verdict_graph_milestone_authority.py \
  contracts/verdict_graph_milestone_registry.py \
  contracts/verdict_graph_milestone_adjudicator.py

for contract in \
  contracts/verdict_graph_milestone_authority.py \
  contracts/verdict_graph_milestone_registry.py \
  contracts/verdict_graph_milestone_adjudicator.py \
  contracts/verdict_graph_milestone_authority_deploy.py \
  contracts/verdict_graph_milestone_registry_deploy.py \
  contracts/verdict_graph_milestone_adjudicator_deploy.py; do
  PATH="$ROOT/.venv/bin:$PATH" .venv/bin/genvm-lint check "$contract"
done

forge build --force --sizes
EXPECTED_RUNTIME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["expectedVaultRuntimeSha256"])' deploy/milestone-bradbury.template.json)"
RUNTIME_REGISTRY="${VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS:-0x0000000000000000000000000000000000000000}"
ACTUAL_RUNTIME="$(python3 scripts/milestone_vault_runtime_hash.py "$RUNTIME_REGISTRY")"
[[ "$ACTUAL_RUNTIME" == "$EXPECTED_RUNTIME" ]] || { echo "STOP: milestone Vault runtime hash drift: $ACTUAL_RUNTIME"; exit 1; }
echo "PASS milestone Vault runtime identity: $ACTUAL_RUNTIME"

AUTHORITY_ARTIFACT_SHA256="$(python3 -c 'import hashlib; print(hashlib.sha256(open("contracts/verdict_graph_milestone_authority_deploy.py","rb").read()).hexdigest())')"
REGISTRY_ARTIFACT_SHA256="$(python3 -c 'import hashlib; print(hashlib.sha256(open("contracts/verdict_graph_milestone_registry_deploy.py","rb").read()).hexdigest())')"
ADJUDICATOR_ARTIFACT_SHA256="$(python3 -c 'import hashlib; print(hashlib.sha256(open("contracts/verdict_graph_milestone_adjudicator_deploy.py","rb").read()).hexdigest())')"
ACCEPTANCE_AUTHORITY_B64="$(python3 -c 'import base64,sys; print(base64.b64encode(bytes.fromhex(sys.argv[1][2:])).decode())' "$ACCEPTANCE_AUTHORITY")"
AUTHORITY_ADDRESS_B64="$(python3 -c 'import base64,sys; print(base64.b64encode(bytes.fromhex(sys.argv[1][2:])).decode())' "$AUTHORITY_ADDRESS")"
REGISTRY_ADDRESS_B64="$(python3 -c 'import base64,sys; print(base64.b64encode(bytes.fromhex(sys.argv[1][2:])).decode())' "$REGISTRY_ADDRESS")"

VERDICTGRAPH_DEPLOYER="$DEPLOYER" \
VERDICTGRAPH_MILESTONE_CONSTRUCTOR_ARGS_JSON="[\"$ACCEPTANCE_AUTHORITY_B64\",\"$AUTHORITY_ARTIFACT_SHA256\"]" \
  node scripts/milestone_bradbury_deploy_estimate.mjs contracts/verdict_graph_milestone_authority_deploy.py Authority
VERDICTGRAPH_DEPLOYER="$DEPLOYER" \
VERDICTGRAPH_MILESTONE_CONSTRUCTOR_ARGS_JSON="[\"$AUTHORITY_ADDRESS_B64\",\"$REGISTRY_ARTIFACT_SHA256\"]" \
  node scripts/milestone_bradbury_deploy_estimate.mjs contracts/verdict_graph_milestone_registry_deploy.py Registry
VERDICTGRAPH_DEPLOYER="$DEPLOYER" \
VERDICTGRAPH_MILESTONE_CONSTRUCTOR_ARGS_JSON="[\"$REGISTRY_ADDRESS_B64\",\"$ADJUDICATOR_ARTIFACT_SHA256\"]" \
  node scripts/milestone_bradbury_deploy_estimate.mjs contracts/verdict_graph_milestone_adjudicator_deploy.py Adjudicator

VERDICTGRAPH_DEPLOYER="$DEPLOYER" \
VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS="$REGISTRY_ADDRESS" \
  node scripts/milestone_vault_deploy_estimate.mjs

printf '%s\n' "=== PRE-FLIGHT PASS: split milestone deployment may proceed only with the reviewed command order ==="
