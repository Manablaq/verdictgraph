#!/usr/bin/env python3
"""Fast source-level regression gates for reviewer-critical VerdictGraph properties.

This is deliberately not a replacement for GenVM lint, Direct Mode, Solidity
compilation, Bradbury execution, or browser E2E. It catches accidental removal
of architectural hard gates before those slower checks run.
"""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / "contracts/verdict_graph_core.py").read_text()
REGISTRY = (ROOT / "contracts/verdict_graph_registry.py").read_text()
ADJUDICATOR = (ROOT / "contracts/verdict_graph_adjudicator.py").read_text()
SPLIT_BUILDER = (ROOT / "scripts/build_stage4e_split_deploy_artifacts.py").read_text()
SPLIT_PROBE = (ROOT / "scripts/stage4e_split_deploy_estimate.mjs").read_text()
STAGE4E_SCRIPT = (ROOT / "scripts/mac_stage4e_split_architecture_verify.sh").read_text()
SPLIT_REGISTRY_TESTS = (ROOT / "tests/direct/test_split_registry.py").read_text()
SPLIT_ADJUDICATOR_TESTS = (ROOT / "tests/direct/test_split_adjudicator.py").read_text()
DIRECT_CONFTEST = (ROOT / "tests/direct/conftest.py").read_text()
SPLIT_DIRECT_TESTS = SPLIT_REGISTRY_TESTS + "\n" + SPLIT_ADJUDICATOR_TESTS
VAULT = (ROOT / "evm/contracts/VerdictGraphVault.sol").read_text()
REQ = (ROOT / "requirements.txt").read_text()
FRONTEND_PACKAGE = (ROOT / "frontend/package.json").read_text()
FRONTEND_VAULT = (ROOT / "frontend/lib/genlayer/vault.ts").read_text()
FRONTEND_CLIENT = (ROOT / "frontend/lib/genlayer/client.ts").read_text()
FRONTEND_ENV = (ROOT / "frontend/.env.example").read_text()
SOURCE_MANIFEST_SCRIPT = (ROOT / "scripts/source_manifest.py").read_text()
VERIFY_MANIFEST_SCRIPT = (ROOT / "scripts/verify_manifest.py").read_text()
VAULT_TESTS = (ROOT / "evm/test/VerdictGraphVault.t.sol").read_text()
STAGE2_SCRIPT = (ROOT / "scripts/mac_stage2_verify.sh").read_text()
STAGE3_SCRIPT = (ROOT / "scripts/mac_stage3_verify.sh").read_text()
STAGE4A_SCRIPT = (ROOT / "scripts/mac_stage4_bradbury_probe.sh").read_text()
STAGE4B_SCRIPT = (ROOT / "scripts/mac_stage4b_core_deploy_preflight.sh").read_text()
STAGE4C_SCRIPT = (ROOT / "scripts/mac_stage4c_core_recovery_verify.sh").read_text()
CORE_DEPLOY_BUILDER = (ROOT / "scripts/build_core_deploy_artifact.py").read_text()
CORE_DEPLOY_PROBE = (ROOT / "scripts/stage4c_core_deploy_estimate.mjs").read_text()
STAGE4D_SCRIPT = (ROOT / "scripts/mac_stage4d_core_transport_recovery.sh").read_text()
STAGE4D_BUILDER = (ROOT / "scripts/build_core_deploy_candidates.py").read_text()
STAGE4D_PROBE = (ROOT / "scripts/stage4d_core_deploy_estimate.mjs").read_text()
STAGE4D_PARITY = (ROOT / "scripts/verify_core_deploy_parity.py").read_text()
CORE_DEPLOY_PATH = ROOT / "contracts/verdict_graph_core_deploy.py"
CORE_DEPLOY = CORE_DEPLOY_PATH.read_text() if CORE_DEPLOY_PATH.is_file() else ""
DIRECT_TEST_SOURCES = "".join(p.read_text() for p in (ROOT / "tests/direct").glob("test_core_*.py"))


def _strip_docstrings(tree: ast.AST) -> ast.AST:
    class Strip(ast.NodeTransformer):
        @staticmethod
        def clean(node):
            body = getattr(node, "body", None)
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
                node.body = body[1:]
            return node
        def visit_Module(self, node):
            self.generic_visit(node); return self.clean(node)
        def visit_ClassDef(self, node):
            self.generic_visit(node); return self.clean(node)
        def visit_FunctionDef(self, node):
            self.generic_visit(node); return self.clean(node)
        def visit_AsyncFunctionDef(self, node):
            self.generic_visit(node); return self.clean(node)
    return Strip().visit(tree)


def _deploy_ast_matches() -> bool:
    if not CORE_DEPLOY:
        return False
    canonical = _strip_docstrings(ast.parse(CORE))
    deploy = ast.parse(CORE_DEPLOY)
    return ast.dump(canonical, include_attributes=False) == ast.dump(deploy, include_attributes=False)
BRADBURY_TEMPLATE = (ROOT / "deploy/bradbury.template.json").read_text()
ROOT_PACKAGE = (ROOT / "package.json").read_text()
GITIGNORE = (ROOT / ".gitignore").read_text()
NPMRC = (ROOT / ".npmrc").read_text()
NVMRC = (ROOT / ".nvmrc").read_text().strip()
FRONTEND_TSCONFIG = (ROOT / "frontend/tsconfig.json").read_text()
SEARCH_PARAM_ROUTES = [
    page.read_text()
    for page in (ROOT / "frontend/app").rglob("page.tsx")
    if "useSearchParams(" in page.read_text()
]

checks = {
    "current GenVM dependency pinned": 'py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6' in CORE,
    "custom nondeterministic validator": "gl.vm.run_nondet_unsafe" in CORE,
    "validator independently re-evaluates": "validator_data = evaluate_once()" in CORE,
    "exact decision binding": 'leader_data.get("decision") == validator_data.get("decision")' in CORE,
    "exact rule binding": 'leader_data.get("violated_rule_id")' in CORE and 'validator_data.get("violated_rule_id")' in CORE,
    "exact consequence binding": 'leader_data.get("consequence_rule_id")' in CORE and 'validator_data.get("consequence_rule_id")' in CORE,
    "evidence authority address binding": "Evidence issuer is not approved by the bound policy" in CORE,
    "publisher boundary binding": "outside the approved publisher boundary" in CORE,
    "publisher diversity counts distinct HTTPS origins": "Policy publisher origins must be distinct" in CORE and "publisher-origin:" in CORE,
    "minimum two issuers": "at least two independent issuers and publishers" in CORE,
    "zero-address evidence authority rejected": "Approved issuer cannot be the zero address" in CORE,
    "authority lists are bounded": "MAX_POLICY_ISSUERS" in CORE and "MAX_POLICY_PUBLISHERS" in CORE,
    "workflow graph is bounded": "MAX_HANDOFFS_PER_WORKFLOW" in CORE and "MAX_DEPENDENCIES_PER_HANDOFF" in CORE,
    "stable evidence id anti-reuse": "Stable evidence id has already been consumed" in CORE,
    "freshness rechecked at review": "EVIDENCE_STALE_AT_REVIEW" in CORE,
    "corroboration group bound": "same registered fact group" in CORE,
    "corroboration requires distinct bytes": "Corroborating evidence must use distinct content digests" in CORE,
    "response bytes hash-verified": "RESPONSE_HASH_MISMATCH" in CORE,
    "repair state persisted": "observed_failure_sha256" in CORE and "failed_evidence_id" in CORE,
    "fresh revision path": "def begin_revision(" in CORE,
    "evidence-only repair revision": "Evidence-only repair does not require inventing a party response" in CORE,
    "repair carries valid corroborators forward": "Carry every prior source forward except the exact evidence record" in CORE,
    "failed stable record repair requires higher version": "int(version) <= int(prior_record.version)" in CORE,
    "stable repair remains issuer-bound": "prior_record.issuer != gl.message.sender_address" in CORE,
    "review has post-review response window": "post-review response window" in CORE.lower() and "settlement_earliest_at" in CORE,
    "settlement is separate from review": "def queue_settlement(" in CORE,
    "settlement binds latest verdict": "Settlement must bind the latest verdict" in CORE,
    "queued settlement blocks fresh revision": "Settlement is already queued for finalization" in CORE,
    "deadline recovery path": "def recover_case(" in CORE,
    "policy fingerprint in verdict": "policy_fingerprint_sha256" in CORE,
    "EVM boundary used for custody": "@gl.evm.contract_interface" in CORE,
    "vault binding verified on-chain": "Vault Core binding does not match this contract" in CORE and ".view().core()" in CORE,
    "no accepted-stage EVM effect": 'emit(on="accepted")' not in CORE,
    "vault enforces split controller roles": "modifier onlyRegistryCore()" in VAULT and "modifier onlyAdjudicatorCore()" in VAULT,
    "vault binds policy fingerprint": "escrow.policyFingerprintSha256" in VAULT,
    "vault idempotent case processing": "processedCases" in VAULT,
    "vault registration idempotent for identical terms": "IDENTICAL_TERMS_ALREADY_REGISTERED" in VAULT,
    "vault deadline recovery": "recover_unactivated" in VAULT and "recover_active" in VAULT,
    "vault uses pull withdrawal": "mapping(address => uint256) public claimable" in VAULT and "function withdraw()" in VAULT,
    "happy path delivery is hash pinned": "def submit_handoff_delivery(" in CORE and "Delivery SHA-256" in CORE,
    "requester acceptance is explicit": "def accept_handoff_delivery(" in CORE and "Only the handoff requester can accept delivery" in CORE,
    "accepted handoff cannot be disputed": "Completed handoff cannot be disputed" in CORE,
    "disputed handoff cannot be directly accepted": "Disputed handoff cannot be accepted directly" in CORE,
    "happy path release is finality-only Core to Vault": "apply_handoff_completion" in CORE and "apply_handoff_completion" in VAULT,
    "semantic review can verify provider delivery bytes": "DELIVERY_HASH_MISMATCH" in CORE and "<UNTRUSTED_PROVIDER_DELIVERY>" in CORE,
    "delivery repairs preserve version history": "class DeliveryRecord" in CORE and "def repair_handoff_delivery(" in CORE and "def get_delivery(" in CORE,
    "transient fetch failures can retry same revision": "def retry_current_revision(" in CORE and "DELIVERY_FETCH_FAILED" in CORE and "RESPONSE_FETCH_FAILED" in CORE,
    "finalized happy-path message can retry idempotently": "def retry_handoff_completion(" in CORE and "completion_attempt_count" in CORE and "Vault escrow is no longer active" in CORE,
    "finalized dispute settlement can retry idempotently": "settlement_attempt_count" in CORE and "if case.settlement_queued:" in CORE and "apply_final_verdict" in CORE,
    "Core can synchronize terminal Vault state": "def sync_handoff_vault_status(" in CORE and "def sync_case_vault_status(" in CORE and "CASE_SETTLED" in CORE,
    "no percentage payout tolerance": "500" not in CORE and "basis point" not in CORE.lower(),
    "genlayer-py commit pinned": "a3dc35e04898e3889cbfa855bcaf7d2664675b8f" in REQ,
    "genlayer-test commit pinned": "9c09578b143905471fb0657dd53bdaf18da8e35f" in REQ,
    "genvm-linter commit pinned": "28450e665666300fc648dbe495110dfd0cb6a7b4" in REQ,
    "frontend GenLayer SDK fee-aware commit pinned": "1b7f50a3a3f2963ea857941b0fb386081dd5c326" in FRONTEND_PACKAGE,
    "frontend never floats GenLayer SDK main": "genlayer-js.git#main" not in FRONTEND_PACKAGE,
    "frontend simulates write fees": "estimateTransactionFeesForWrite" in FRONTEND_CLIENT,
    "frontend forwards message fee allocations": "messageAllocations: recommended.messageAllocations" in FRONTEND_CLIENT,
    "frontend uses current read transaction variants": "TransactionHashVariant.LATEST_FINAL" in FRONTEND_CLIENT and "TransactionHashVariant.LATEST_NONFINAL" in FRONTEND_CLIENT,
    "frontend Core calldata uses exact GenLayer SDK encodable type": "type CalldataEncodable" in FRONTEND_CLIENT and "export type CoreArgs = CalldataEncodable[];" in FRONTEND_CLIENT and "args: CoreArgs = []" in FRONTEND_CLIENT and "args: unknown[] = []" not in FRONTEND_CLIENT,
    "frontend transaction hashes use exact GenLayer SDK hash type": "type TransactionHash" in FRONTEND_CLIENT and "export type TxHash = TransactionHash;" in FRONTEND_CLIENT and "const hash = await client.writeContract" in FRONTEND_CLIENT,
    "frontend distinguishes provisional state": "SnapshotNotice" in "".join(p.read_text() for p in (ROOT / "frontend").rglob("*.tsx")),
    "frontend Vault address matches bound Core": "Frontend Vault address does not match the Vault bound in finalized Core state" in FRONTEND_VAULT,
    "frontend env names match client": "NEXT_PUBLIC_VERDICTGRAPH_CORE_ADDRESS" in FRONTEND_ENV and "NEXT_PUBLIC_VERDICTGRAPH_VAULT_ADDRESS" in FRONTEND_ENV,
    "creator-scoped ID lookups avoid global count inference": "get_latest_workflow_for_owner" in CORE and "get_latest_case_for_opener" in CORE and "get_latest_handoff_for_workflow" in CORE,
    "fatal validation helper is typed non-returning": "def _fail(message: str) -> NoReturn:" in CORE,
    "web response status is compatible with production and Direct Mode shapes": all(token in CORE for token in (
        'def _http_status(response) -> int:',
        'getattr(response, "status_code", None)',
        'getattr(response, "status", None)',
        'delivery_status = _http_status(delivery_response)',
        'response_status = _http_status(party_response)',
        'status = _http_status(response)',
    )) and '.status_code < 200' not in CORE,
    "optional web bodies are handled before hashing or decoding": "if delivery_body is None:" in CORE and "if response_body is None:" in CORE and "if body is None:" in CORE,
    "EVM interface arguments are positional-only": "def handoff_status(self, handoff_id: u256, /)" in CORE and CORE.count("            /,\n        ) -> None:") >= 3,
    "vault canonical SHA-256 bindings": "_isLowerHexSha256(policyFingerprintSha256)" in VAULT and "_isLowerHexSha256(deliverySha256)" in VAULT and "_isLowerHexSha256(verdictSha256)" in VAULT,
    "vault rejects direct native transfers without payable receive/fallback": "receive()" not in VAULT and "fallback() external {" in VAULT and "fallback() external payable" not in VAULT,
    "vault rejects malformed verdict before case consumption": "if (!_isLowerHexSha256(verdictSha256)) revert InvalidTerms();" in VAULT and VAULT.index("if (!_isLowerHexSha256(verdictSha256)) revert InvalidTerms();") < VAULT.index("if (processedCases[caseId])"),
    "vault premature verdict does not consume retryable case": VAULT.index("if (escrow.status != EscrowStatus.ACTIVE)") < VAULT.index("processedCases[caseId] = true") and "testPrematureVerdictDoesNotConsumeCaseAndCanRetryAfterActivation" in VAULT_TESTS,
    "vault adversarial test suite expanded": VAULT_TESTS.count("function test") >= 29,
    "vault tests cover reentrancy and failed withdrawals": "testWithdrawReentrancyCannotDoubleSpend" in VAULT_TESTS and "testWithdrawalFailureRestoresClaimableBalance" in VAULT_TESTS,
    "vault tests avoid removed Foundry testFail convention": "function testFail" not in VAULT_TESTS,
    "vault zero-controller constructor tests capture expected reverts": "function deployVaultForTest(address registryCore_, address adjudicatorCore_)" in VAULT_TESTS and "zero registry core accepted" in VAULT_TESTS and "zero adjudicator core accepted" in VAULT_TESTS,
    "vault only-Core verdict test does not consume prank on getter": "uint256 breachRule = vault.CONSEQUENCE_PROVIDER_BREACH();" in VAULT_TESTS and "(91, 1, 11, POLICY, breachRule, VERDICT)" in VAULT_TESTS,
    "vault tests cover exact consequence arithmetic": all(name in VAULT_TESTS for name in ("testReleaseProviderVerdictPaysExactPrincipalAndBond", "testProviderBreachTransfersExactPrincipalAndBondToRequester", "testNeutralConsequenceReturnsPrincipalAndBondSeparately")),
    "vault tests include fuzzed exact release arithmetic": "testFuzzExactProviderRelease" in VAULT_TESTS and "vm.assume" in VAULT_TESTS,
    "Stage 2 pins Foundry stable release": "foundryup --install v1.8.1" in STAGE2_SCRIPT and "foundryup --use v1.8.1" in STAGE2_SCRIPT,
    "Stage 2 compiles and executes Vault tests": "forge build --force --sizes" in STAGE2_SCRIPT and "forge test -vvv" in STAGE2_SCRIPT,
    "source manifest survives Direct Mode artifact cleanup": "verification/source-manifest.json" in SOURCE_MANIFEST_SCRIPT and "verification/source-manifest.json" in VERIFY_MANIFEST_SCRIPT and "artifacts/source-manifest.json" not in SOURCE_MANIFEST_SCRIPT + VERIFY_MANIFEST_SCRIPT,
    "source manifest recursively covers frontend and reviewer sources": "verdictgraph-source-manifest-v4-deterministic-source-set" in SOURCE_MANIFEST_SCRIPT and "frontend/app" in SOURCE_MANIFEST_SCRIPT and "frontend/components" in SOURCE_MANIFEST_SCRIPT and "package-lock.json" in SOURCE_MANIFEST_SCRIPT,
    "frontend pins supported Node LTS exactly": NVMRC == "24.20.0" and '"node": "24.20.0"' in ROOT_PACKAGE and '"npm": "11.19.0"' in ROOT_PACKAGE,
    "frontend pins npm package manager exactly": '"packageManager": "npm@11.19.0"' in ROOT_PACKAGE and "engine-strict=true" in NPMRC,
    "frontend uses patched Next active-LTS build": '"next": "16.3.4"' in FRONTEND_PACKAGE and '"next": "16.0.0"' not in FRONTEND_PACKAGE,
    "frontend uses patched React 19.2 line": '"react": "19.2.8"' in FRONTEND_PACKAGE and '"react-dom": "19.2.8"' in FRONTEND_PACKAGE,
    "frontend viem aligns with current GenLayer SDK major": '"viem": "2.56.3"' in FRONTEND_PACKAGE,
    "unused Wagmi and Radix dependency surface removed": all(token not in FRONTEND_PACKAGE for token in ("@wagmi/connectors", "@wagmi/core", '"wagmi"', "@radix-ui/react-dialog", "@radix-ui/react-label", "@radix-ui/react-slot")),
    "generated TypeScript build cache is ignored": "*.tsbuildinfo" in GITIGNORE,
    "Stage 3 pins exact Node and npm runtime": 'NODE_VERSION="24.20.0"' in STAGE3_SCRIPT and 'NPM_VERSION="11.19.0"' in STAGE3_SCRIPT and 'NVM_VERSION="v0.40.7"' in STAGE3_SCRIPT,
    "Stage 3 loads nvm without premature .nvmrc auto-use": '. "$NVM_DIR/nvm.sh" --no-use' in STAGE3_SCRIPT and "command -v nvm >/dev/null 2>&1" in STAGE3_SCRIPT and 'nvm install "$NODE_VERSION"' in STAGE3_SCRIPT and 'nvm use "$NODE_VERSION"' in STAGE3_SCRIPT,
    "Stage 3 preserves user npmrc while isolating nvm activation": all(token in STAGE3_SCRIPT for token in (
        'USER_NPMRC="$HOME/.npmrc"',
        'trap restore_user_npmrc EXIT',
        'Temporarily isolated ~/.npmrc for nvm activation',
        'Restored original ~/.npmrc after nvm activation',
        'export NPM_CONFIG_USERCONFIG="$ROOT/.npmrc"',
        'NPM_CONFIG_PREFIX|NPM_CONFIG_GLOBALCONFIG',
    )) and 'nvm use --delete-prefix' not in STAGE3_SCRIPT,
    "Stage 3 is compatible with macOS Bash 3.2 env normalization": "LC_ALL=C tr '[:lower:]' '[:upper:]'" in STAGE3_SCRIPT and '${config_name^^}' not in STAGE3_SCRIPT,
    "Stage 3 creates then reuses lockfile reproducibly": "package-lock.json absent: bootstrapping exact lock with npm install" in STAGE3_SCRIPT and "package-lock.json present: using npm ci" in STAGE3_SCRIPT,
    "Stage 3 verifies exact GenLayer SDK lock provenance": "genlayer-js resolved to exact commit" in STAGE3_SCRIPT and "1b7f50a3a3f2963ea857941b0fb386081dd5c326" in STAGE3_SCRIPT,
    "Stage 3 executes typecheck production build and audit": "npm run lint" in STAGE3_SCRIPT and "npm run build" in STAGE3_SCRIPT and "npm audit --omit=dev --audit-level=high" in STAGE3_SCRIPT,
    "all useSearchParams routes are protected by Suspense": bool(SEARCH_PARAM_ROUTES) and all("<Suspense" in page and page.index("<Suspense") < page.index("useSearchParams(") for page in SEARCH_PARAM_ROUTES),
    "Next TypeScript config includes generated dev route types": '".next/dev/types/**/*.ts"' in FRONTEND_TSCONFIG,
    "Stage 3 whitespace gate works without Git metadata": "python3 scripts/whitespace_gate.py" in STAGE3_SCRIPT and 'git -C "$ROOT" rev-parse --is-inside-work-tree' in STAGE3_SCRIPT and "recursive manifest hygiene gate is authoritative" in STAGE3_SCRIPT,
    "Stage 4A is keyless and non-destructive": "No private key is read; this stage sends no transactions and spends no GEN." in STAGE4A_SCRIPT and "PRIVATE_KEY" not in STAGE4A_SCRIPT and "cast send" not in STAGE4A_SCRIPT,
    "Stage 4A binds both Bradbury RPC endpoints and chain id": "https://rpc-bradbury.genlayer.com" in STAGE4A_SCRIPT and "https://rpc.testnet-chain.genlayer.com" in STAGE4A_SCRIPT and "EXPECTED_CHAIN_ID_DEC=4221" in STAGE4A_SCRIPT and STAGE4A_SCRIPT.count("eth_chainId") >= 1,
    "Stage 4A live-probes PUSH0 support": 'PUSH0_INITCODE="0x5f60005260206000f3"' in STAGE4A_SCRIPT and "eth_call" in STAGE4A_SCRIPT and "PASS Bradbury executes PUSH0 creation initcode" in STAGE4A_SCRIPT,
    "Stage 4A pins Foundry and compiles exact Vault": 'FOUNDRY_VERSION="v1.8.1"' in STAGE4A_SCRIPT and "forge build --force --sizes" in STAGE4A_SCRIPT and "VerdictGraphVault.sol:VerdictGraphVault" in STAGE4A_SCRIPT,
    "Stage 4A rejects documented unsupported EVM opcodes": all(op in STAGE4A_SCRIPT for op in ("CALLCODE", "SELFDESTRUCT", "BLOBHASH", "BLOBBASEFEE")) and "cast disassemble" in STAGE4A_SCRIPT,
    "Stage 4A verifies Core-Vault deployment order": "deployment order is Core -> Vault(core) -> Core.bind_vault(vault)" in STAGE4A_SCRIPT and "bound_core != gl.message.contract_address" in CORE,
    "source manifest exposes deterministic deployment source-set digest": "verdictgraph-source-manifest-v4-deterministic-source-set" in SOURCE_MANIFEST_SCRIPT and "verdictgraph-source-set-v1" in SOURCE_MANIFEST_SCRIPT and "source_set_sha256" in SOURCE_MANIFEST_SCRIPT and "source_set_sha256" in VERIFY_MANIFEST_SCRIPT,
    "Bradbury deployment template reflects split architecture and no stale Vault hash": "verdictgraph-bradbury-deployment-v3-split" in BRADBURY_TEMPLATE and "registryDeploySourceSha256" in BRADBURY_TEMPLATE and "adjudicatorDeploySourceSha256" in BRADBURY_TEMPLATE and '"vaultCreationSha256": null' in BRADBURY_TEMPLATE and "sourceSetSha256" in BRADBURY_TEMPLATE,
    "Stage 4B preflight is non-destructive": "no private key is requested, no transaction is signed, and nothing is deployed" in STAGE4B_SCRIPT.lower() and "genlayer deploy --contract contracts/verdict_graph_core.py" in STAGE4B_SCRIPT and "intentionally not executed" in STAGE4B_SCRIPT and "PRIVATE_KEY" not in STAGE4B_SCRIPT,
    "Stage 4B pins stable Bradbury CLI and active account read": 'EXPECTED_GENLAYER_CLI="0.39.2"' in STAGE4B_SCRIPT and "testnet-bradbury" in STAGE4B_SCRIPT and "genlayer account show --rpc" in STAGE4B_SCRIPT and "eth_getBalance" in STAGE4B_SCRIPT,
    "Stage 4B refuses Vault artifact drift before Core deployment": "EXPECTED_VAULT_CREATION_SHA256" in STAGE4B_SCRIPT and "EXPECTED_VAULT_RUNTIME_SHA256" in STAGE4B_SCRIPT and "Vault creation bytecode drift" in STAGE4B_SCRIPT and "Vault runtime bytecode drift" in STAGE4B_SCRIPT,
    "deployment Core parity is constrained by deterministic Stage 4D models": all(token in STAGE4D_PARITY for token in ("exact_ast", "diagnostic_compact", "private_symbol_compact", "public ABI matches canonical Core", "storage field surface matches canonical Core")),
    "deployment Core is materially smaller without touching canonical source": bool(CORE_DEPLOY) and len(CORE_DEPLOY.encode("utf-8")) <= 72_000 and len(CORE_DEPLOY) < len(CORE),
    "deployment artifact builder hard-fails on AST or size drift": all(token in CORE_DEPLOY_BUILDER for token in ("AST-equivalent", "MAX_DEPLOY_BYTES = 72_000", "ast.dump", "STOP: generated deployment artifact")),
    "Direct Mode can target the exact deployment artifact": DIRECT_TEST_SOURCES.count('os.environ.get("VERDICTGRAPH_CONTRACT", "contracts/verdict_graph_core.py")') == 4,
    "Stage 4C re-runs GenVM and Direct Mode on deployment artifact": all(token in STAGE4C_SCRIPT for token in ('genvm-lint typecheck "$DEPLOY_CORE"', 'genvm-lint check "$DEPLOY_CORE"', 'VERDICTGRAPH_CONTRACT="$DEPLOY_CORE" python -m pytest tests/direct -v')),
    "Stage 4C Bradbury estimator is cryptographically keyless and blocks sends": all(token in CORE_DEPLOY_PROBE for token in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_signTransaction", "VERDICTGRAPH_PROBE_BLOCKED_SEND", "no private key")) and "PRIVATE_KEY" not in CORE_DEPLOY_PROBE,
    "Stage 4C never invokes a deployment CLI or cast send": "genlayer deploy" not in STAGE4C_SCRIPT and "cast send" not in STAGE4C_SCRIPT and "PRIVATE_KEY" not in STAGE4C_SCRIPT,
    "Stage 4D generates progressively smaller Core candidates": all(token in STAGE4D_BUILDER for token in ("exact_ast", "diagnostic_compact", "private_symbol_compact", "candidate size ordering is not strictly decreasing")),
    "Stage 4D exact candidate retains executable AST": "exact candidate is not executable-AST identical" in STAGE4D_BUILDER and "StripDocstrings" in STAGE4D_BUILDER,
    "Stage 4D diagnostic compaction cannot alter persistent failure codes": "CompactDiagnostics" in STAGE4D_BUILDER and 'node.func.id == "_fail"' in STAGE4D_BUILDER and 'node.func.id == "_bounded_text"' in STAGE4D_BUILDER,
    "Stage 4D private symbol compaction is reversible": "ReverseInternalSymbols" in STAGE4D_BUILDER and "failed reversible AST parity proof" in STAGE4D_BUILDER,
    "Stage 4D preserves public ABI and storage surface": "verify_public_and_storage" in STAGE4D_BUILDER and "changed public Core ABI" in STAGE4D_BUILDER and "changed storage field surface" in STAGE4D_BUILDER,
    "Stage 4D live estimator blocks every send path": all(token in STAGE4D_PROBE for token in ("eth_sendTransaction", "eth_sendRawTransaction", "eth_signTransaction", "VERDICTGRAPH_STAGE4D_BLOCKED_SEND", "no private key")) and "PRIVATE_KEY" not in STAGE4D_PROBE,
    "Stage 4D probes least-transformed candidate first": STAGE4D_SCRIPT.index("exact_ast.py") < STAGE4D_SCRIPT.index("diagnostic_compact.py") < STAGE4D_SCRIPT.index("private_symbol_compact.py"),
    "Stage 4D re-verifies selected source before any deployment": all(token in STAGE4D_SCRIPT for token in ('genvm-lint typecheck "$DEPLOY_CORE"', 'genvm-lint check "$DEPLOY_CORE"', 'VERDICTGRAPH_CONTRACT="$DEPLOY_CORE" python -m pytest tests/direct -v', 'DO NOT DEPLOY YET.')) and "genlayer deploy" not in STAGE4D_SCRIPT and "cast send" not in STAGE4D_SCRIPT,
    "Stage 4E split keeps dispute lock on Registry": "def open_case(" in REGISTRY and "handoff_case_id[handoff_id]" in REGISTRY and '.emit().initialize_case(case_id)' in REGISTRY and 'emit(on="accepted")' not in REGISTRY,
    "Stage 4E Adjudicator only accepts finalized Registry initialization": "Only the bound registry can initialize cases" in ADJUDICATOR and "def initialize_case(" in ADJUDICATOR,
    "Stage 4E evidence authority remains Registry-bound": "is_policy_issuer" in ADJUDICATOR and "is_policy_publisher" in ADJUDICATOR and "Evidence issuer is not approved" in ADJUDICATOR,
    "Stage 4E Vault Registry role is narrow": "external onlyRegistryCore" in VAULT and "function register_handoff" in VAULT and "function apply_handoff_completion" in VAULT,
    "Stage 4E Vault Adjudicator role is narrow": "function apply_final_verdict" in VAULT and "external onlyAdjudicatorCore" in VAULT,
    "Stage 4E deployment artifacts are AST-equivalent": "AST parity failure" in SPLIT_BUILDER and "ast.unparse" in SPLIT_BUILDER,
    "Stage 4E live estimator is no-send": "VERDICTGRAPH_STAGE4E_BLOCKED_SEND" in SPLIT_PROBE and "eth_sendRawTransaction" in SPLIT_PROBE and "PRIVATE_KEY" not in SPLIT_PROBE,
    "Stage 4E Direct Mode covers split binding dispute lock authority and validator parity": all(token in SPLIT_DIRECT_TESTS for token in ("test_split_binding_and_finalized_case_receiver", "test_split_vault_binding_is_one_shot_without_ethcall", "test_split_adjudicator_vault_binding_is_one_shot_without_ethcall", "test_split_dispute_lock_blocks_direct_acceptance", "test_split_evidence_authority_is_registry_bound", "test_split_validator_rederives_exact_consequence", "test_split_case_initialization_retry_is_idempotent")),
    "Stage 4E Direct Mode mocks only documented cross-contract boundary requests": "_gl_call_hook" in SPLIT_DIRECT_TESTS and "CallContract" in SPLIT_DIRECT_TESTS and "PostMessage" in SPLIT_REGISTRY_TESTS and "bytes([0]) + calldata.encode(result)" in SPLIT_DIRECT_TESTS,
    "Stage 4E Registry split fixture uses two distinct evidence issuers": 'INDEPENDENT_ISSUER = bytes.fromhex("11" * 20)' in SPLIT_REGISTRY_TESTS and "registry.add_policy_issuer(policy, to_hex(owner))" in SPLIT_REGISTRY_TESTS and "registry.add_policy_issuer(policy, to_hex(issuer))" in SPLIT_REGISTRY_TESTS,
    "Stage 4E split address assertions normalize representations": "assert to_hex(adjudicator.registry_address()) == to_hex(direct_owner)" in SPLIT_ADJUDICATOR_TESTS and "assert adjudicator.registry_address() == direct_owner" not in SPLIT_ADJUDICATOR_TESTS,
    "Stage 4E Direct address helper is SDK-independent before first deployment": "from genlayer" not in DIRECT_CONFTEST and "import genlayer" not in DIRECT_CONFTEST and "isinstance(addr, (bytes, bytearray, memoryview))" in DIRECT_CONFTEST and 'return "0x" + raw.hex()' in DIRECT_CONFTEST and "PASS Direct address helper is SDK-independent before first deploy" in STAGE4E_SCRIPT,
    "Stage 4E Direct Mode isolates split ICs by process without loader mutation": all(token in STAGE4E_SCRIPT for token in ("VERDICTGRAPH_SPLIT_DIRECT_ROLE=registry", "VERDICTGRAPH_SPLIT_DIRECT_ROLE=adjudicator", "test_split_registry.py", "test_split_adjudicator.py")) and "__known_contract__" not in SPLIT_DIRECT_TESTS and "_reset_direct_contract_loader_guard" not in SPLIT_DIRECT_TESTS,
    "Stage 4E verifier rechecks both split ICs and all Direct tests": all(token in STAGE4E_SCRIPT for token in ('genvm-lint typecheck "$REGISTRY_DEPLOY"', 'genvm-lint check "$REGISTRY_DEPLOY"', 'genvm-lint typecheck "$ADJUDICATOR_DEPLOY"', 'genvm-lint check "$ADJUDICATOR_DEPLOY"', "test_core_consensus.py", "test_core_evidence.py", "test_core_registry.py", "test_core_response_and_liveness.py", "test_split_registry.py", "test_split_adjudicator.py", "PASS Direct Mode total = 35 canonical + 3 Registry + 4 Adjudicator = 42 tests")),
    "Stage 4E re-verifies dual-controller Vault and records bytecode hashes": all(token in STAGE4E_SCRIPT for token in ('FOUNDRY_VERSION="v1.8.1"', 'forge build --force --sizes', 'forge test -vvv', 'forge inspect "$VAULT_TARGET" bytecode', 'forge inspect "$VAULT_TARGET" deployedBytecode', 'print(f"VAULT_{name.upper()}_SHA256=')),
    "Stage 4E probes both split deployments with sends blocked": all(token in STAGE4E_SCRIPT for token in ('stage4e_split_deploy_estimate.mjs', '"$REGISTRY_DEPLOY registry"', '"$ADJUDICATOR_DEPLOY adjudicator"', 'NO PRIVATE KEY. NO SIGNATURE. NO TRANSACTION SUBMISSION.', 'DO NOT DEPLOY YET.')) and "genlayer deploy" not in STAGE4E_SCRIPT and "cast send" not in STAGE4E_SCRIPT,
    "Stage 4E Registry can retry finalized case initialization": "def retry_case_initialization(" in REGISTRY and '.emit().initialize_case(case_id)' in REGISTRY and "Only a case participant can retry initialization" in REGISTRY,
    "Stage 4E split uses authoritative direct Vault reads instead of synchronous EVM EthCall": "VerdictGraphVault(self.vault_address).view()" not in REGISTRY and "VerdictGraphVault(self.vault_address).view()" not in ADJUDICATOR and "export async function readVaultStatus(" in FRONTEND_VAULT and "function recover_active" in VAULT,
    "Stage 4E one-shot Vault endpoint binding remains EVM-controller enforced": "Vault is already bound" in REGISTRY and "Vault is already bound" in ADJUDICATOR and "immutable registry_core" in VAULT and "immutable adjudicator_core" in VAULT and "onlyRegistryCore" in VAULT and "onlyAdjudicatorCore" in VAULT,
    "Stage 4E all split-to-Vault effects use finalized-default emission": REGISTRY.count('VerdictGraphVault(self.vault_address).emit()') >= 3 and ADJUDICATOR.count('VerdictGraphVault(self.vault_address).emit()') >= 3 and 'emit(on="accepted")' not in REGISTRY and 'emit(on="accepted")' not in ADJUDICATOR,
}

failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}  {name}")

if failed:
    raise SystemExit("\nReviewer gates failed: " + ", ".join(failed))
print(f"\n{len(checks)}/{len(checks)} source-level reviewer gates passed.")
