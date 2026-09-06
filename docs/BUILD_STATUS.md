# Build status

Date: 2026-09-06

## Completed verification checkpoints

### Stage 1 — canonical GenLayer contract baseline

- Canonical source: `contracts/verdict_graph_core.py`.
- Size: 92,357 bytes.
- SHA-256: `59200fc916ed4a61b91aa27593cb773418ceb60d47f1fc269f1361a67aae92da`.
- Pinned GenVM typecheck and lint/validation passed on macOS.
- Direct Mode: **35/35 passed**.
- Independent validator, evidence provenance/freshness/corroboration, repair, exact consequence binding, deadlines and finality semantics were covered by the verified baseline.

### Stage 2 — deterministic Vault baseline

- Foundry `1.8.1`, Solc `0.8.20` verified on macOS.
- Original single-controller Vault compiled.
- **29/29 Foundry tests passed**, including exact arithmetic, recovery, withdrawal failure, reentrancy and fuzz coverage.
- `forge fmt --check`, reviewer and ABI/source-integrity gates passed.

### Stage 3 — frontend reproducibility

- Node `24.20.0` / npm `11.19.0` pinned and reproduced.
- Exact GenLayerJS commit provenance verified from the lockfile.
- TypeScript `tsc --noEmit` passed.
- Next `16.3.4` optimized production build passed and generated all expected routes.
- Production `npm audit --omit=dev --audit-level=high` returned **0 vulnerabilities**.
- Recursive deterministic source manifest, reviewer gates, ABI and source hygiene passed.
- Exact marker: `=== STAGE 3 PASS ===`.

### Stage 4A — Bradbury EVM compatibility

- Both Bradbury RPC endpoints returned chain ID `4221`.
- Live block probe passed.
- Live `PUSH0`/Shanghai creation simulation passed.
- Original Vault creation/runtime bytecode was compiled and hashed.
- Exact marker: `=== STAGE 4A PASS ===`.

### Stage 4B — deployment preflight

- Deployer and Bradbury GEN balance were read without signing.
- Stable deterministic source-set digest was generated.
- Canonical Core and then-current Vault artifact identity were bound into the preflight.
- Exact marker: `=== STAGE 4B PREFLIGHT PASS ===`.

### Original Core deployment attempt

`genlayer deploy --contract contracts/verdict_graph_core.py` did **not** create a successful GenLayer deployment. Bradbury rejected `eth_estimateGas` with `BlockPubdataLimitReached`; CLI `0.39.2` then fell back to `200,000` gas and the outer raw transaction was rejected with `intrinsic gas too low`. No successful VerdictGraph Core address was produced from that attempt.

### Stage 4C — exact-AST transport recovery

- Deterministic 70,836-byte deployment artifact retained executable AST identity with the canonical Core.
- Pinned GenVM typecheck/lint passed on that exact deployment artifact.
- **35/35 Direct Mode tests passed** on that exact artifact.
- Live Bradbury deployment estimation still returned `BlockPubdataLimitReached`.
- The provider shim blocked the SDK fallback before signing/sending; no deployment occurred.

### Stage 4D — progressive compaction boundary

Live no-send Bradbury estimates rejected all three candidates:

- exact-AST: 69,197 bytes;
- diagnostic compact: 62,050 bytes;
- private-symbol compact: 57,721 bytes.

Every probe blocked signing/sending. This established that source compaction alone is not an acceptable deployment strategy for the current Bradbury envelope.

## Stage 4E — split architecture prepared, runtime proof pending

Source now contains:

- `VerdictGraphRegistry` — policy/workflow/handoff/delivery state, dispute locking, finalized/retryable case initialization, finalized Vault registration/completion, and terminal Vault synchronization.
- `VerdictGraphAdjudicator` — case revisions, evidence, independent nondeterministic review, exact verdict binding, repair/recovery, and finalized Vault verdict execution.
- dual-controller `VerdictGraphVault` — immutable Registry controller for registration/happy-path completion and immutable Adjudicator controller for dispute verdicts.
- deterministic AST-equivalent deployment artifacts for Registry and Adjudicator.
- split Direct Mode regressions for binding, finalized case receiver authorization, dispute lock, evidence-authority delegation, validator parity, and initialization retry idempotence.
- a keyless no-send Bradbury estimator for both exact deployment payloads.

Current local source-only checks pass **140/140 reviewer gates**, split IC↔Vault ABI alignment, deterministic manifest verification and source hygiene. These are not substitutes for macOS runtime proof.

Current deployment artifact sizes after liveness hardening:

- Registry: approximately 43.5 KB;
- Adjudicator: approximately 52.6 KB.

Stage 4E is complete only when the macOS script proves:

1. GenVM typecheck/lint for both exact deployment artifacts;
2. all canonical + split Direct Mode tests;
3. Foundry `1.8.1` compile/tests/format for the dual-controller Vault;
4. exact new Vault creation/runtime bytecode hashes;
5. live Bradbury `eth_estimateGas` acceptance for **both** IC deployment payloads while all send/sign methods remain blocked;
6. reviewer, ABI, manifest and hygiene gates;
7. final marker `=== STAGE 4E PASS ===`.

## Still unverified / blocked

- Stage 4E macOS runtime proof.
- Frontend migration from the old single-Core client to Registry + Adjudicator.
- Live Registry deployment.
- Live Adjudicator deployment and finalized Registry binding.
- Live dual-controller Vault deployment and both IC↔Vault bindings.
- Finalized Core/child-message `FINISHED_WITH_RETURN` evidence for live flows.
- Browser E2E against the exact deployed split addresses.
- Explorer/source/manifest/frontend/submission parity.

No README, deployment record or submission should claim those items are complete before their evidence is captured.
