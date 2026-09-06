#!/usr/bin/env bash
set -euo pipefail

REGISTRY="0x65c4acaD8Cfa4a531B5459e7C1f109443734860F"
REGISTRY_TX="0x87a72fa228f91c3f846cb09b0b08d7ec792e6f8c8eaf81515d0a191f3e1c2db2"
EXPECTED_SHA="160f021c6f1bef20645a01aa8672366bb46c8d52f219e9754f753d75b7ead5ff"

STATUS_JSON="$(curl -sS https://rpc-bradbury.genlayer.com \
  -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"gen_getTransactionStatus\",\"params\":[{\"txId\":\"$REGISTRY_TX\"}],\"id\":1}")"

echo "$STATUS_JSON"

STATUS_CODE="$(printf '%s' "$STATUS_JSON" | python3 -c \
  'import json,sys; print(json.load(sys.stdin)["result"]["statusCode"])')"

if [ "$STATUS_CODE" != "7" ]; then
  echo "Registry not Finalized yet. statusCode=$STATUS_CODE"
  echo "No Adjudicator transaction submitted."
  exit 0
fi

echo "PASS: Registry is Finalized."

printf '%s  %s\n' \
  "$EXPECTED_SHA" \
  "contracts/verdict_graph_adjudicator_deploy.py" \
  | shasum -a 256 -c -

if [ -e verification/live/stage4f-adjudicator-deploy.raw.log ]; then
  echo "STOP: Adjudicator deployment log already exists."
  echo "Inspect it before any resend."
  exit 1
fi

genlayer network set testnet-bradbury

set -o pipefail

genlayer deploy \
  --contract contracts/verdict_graph_adjudicator_deploy.py \
  --args "$REGISTRY" \
  2>&1 | tee verification/live/stage4f-adjudicator-deploy.raw.log
