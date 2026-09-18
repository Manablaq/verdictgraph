#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

python3 scripts/build_milestone_deploy_artifact.py
python3 scripts/milestone_gate.py
node --check scripts/milestone_bradbury_deploy_estimate.mjs
node --check scripts/milestone_vault_deploy_estimate.mjs
for contract in \
  contracts/verdict_graph_milestone_authority.py \
  contracts/verdict_graph_milestone_registry.py \
  contracts/verdict_graph_milestone_adjudicator.py \
  contracts/verdict_graph_milestone_authority_deploy.py \
  contracts/verdict_graph_milestone_registry_deploy.py \
  contracts/verdict_graph_milestone_adjudicator_deploy.py; do
  PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/genvm-lint typecheck "$contract"
  PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/genvm-lint check "$contract"
done
PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/genvm-lint typecheck contracts/verdict_graph_milestone.py
PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/genvm-lint check contracts/verdict_graph_milestone.py
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=milestone .venv/bin/python -m pytest tests/direct/test_milestone_controller.py -v
PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/genvm-lint typecheck contracts/verdict_graph_milestone_deploy.py
PATH="$ROOT_DIR/.venv/bin:$PATH" .venv/bin/genvm-lint check contracts/verdict_graph_milestone_deploy.py
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=milestone VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT=contracts/verdict_graph_milestone_deploy.py .venv/bin/python -m pytest tests/direct/test_milestone_controller.py -v
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=authority .venv/bin/python -m pytest tests/direct/test_milestone_authority.py -v
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=registry .venv/bin/python -m pytest tests/direct/test_milestone_registry.py -v
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=adjudicator .venv/bin/python -m pytest tests/direct/test_milestone_adjudicator.py -v
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=authority VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT=contracts/verdict_graph_milestone_authority_deploy.py .venv/bin/python -m pytest tests/direct/test_milestone_authority.py -v
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=registry VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT=contracts/verdict_graph_milestone_registry_deploy.py .venv/bin/python -m pytest tests/direct/test_milestone_registry.py -v
VERDICTGRAPH_MILESTONE_DIRECT_ROLE=adjudicator VERDICTGRAPH_MILESTONE_DIRECT_CONTRACT=contracts/verdict_graph_milestone_adjudicator_deploy.py .venv/bin/python -m pytest tests/direct/test_milestone_adjudicator.py -v
forge build --force --sizes
EXPECTED_RUNTIME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["expectedVaultRuntimeSha256"])' deploy/milestone-bradbury.template.json)"
RUNTIME_REGISTRY="${VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS:-$(python3 -c 'import json; value=json.load(open("deploy/milestone-bradbury.template.json"))["vaultConstructorArgs"][0]; print(value if isinstance(value,str) and len(value)==42 and value.startswith("0x") else "0x"+"0"*40)')}"
ACTUAL_RUNTIME="$(python3 scripts/milestone_vault_runtime_hash.py "$RUNTIME_REGISTRY")"
[[ "$ACTUAL_RUNTIME" == "$EXPECTED_RUNTIME" ]] || { echo "FAIL milestone Vault runtime hash drift: $ACTUAL_RUNTIME"; exit 1; }
echo "PASS milestone Vault runtime identity: $ACTUAL_RUNTIME"
forge test --match-path evm/test/VerdictGraphMilestoneVault.t.sol -vv
npm --prefix frontend run lint
npm --prefix frontend run build

echo "Milestone verification passed: source gates, GenVM lint, Direct Mode, Foundry security/economic tests, TypeScript, and production build."
