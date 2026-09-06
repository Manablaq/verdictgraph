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

## Stage 4E — split architecture verified

Source now contains:

- `VerdictGraphRegistry` — policy/workflow/handoff/delivery state, dispute locking, finalized/retryable case initialization, finalized Vault registration/completion, and terminal Vault synchronization.
- `VerdictGraphAdjudicator` — case revisions, evidence, independent nondeterministic review, exact verdict binding, repair/recovery, and finalized Vault verdict execution.
- dual-controller `VerdictGraphVault` — immutable Registry controller for registration/happy-path completion and immutable Adjudicator controller for dispute verdicts.
- deterministic AST-equivalent deployment artifacts for Registry and Adjudicator.
- split Direct Mode regressions for binding, finalized case receiver authorization, dispute lock, evidence-authority delegation, validator parity, and initialization retry idempotence.
- a keyless no-send Bradbury estimator for both exact deployment payloads.

Stage 4E macOS runtime verification is complete. The reviewer gate passes **145/145** checks, split IC↔Vault ABI alignment passes, deterministic manifest verification passes, and source hygiene passes.

Exact verified deployment artifacts:

- Registry: **43,424 bytes**, SHA-256 `33eed3c7865cf180e3179128962c1d68253368ebef983428e0b294bed6d0c5f3`;
- Adjudicator: **52,561 bytes**, SHA-256 `d09c03112e0b3f42c5494bf9319f07f3813f001ba26f55f95807b8a814bf64a1`.

Stage 4E runtime proof completed successfully:

1. GenVM typecheck/lint/validation passed for both exact split deployment artifacts.
2. Direct Mode passed **40/40** tests: 35 canonical + 2 Registry + 3 Adjudicator.
3. Dual-controller Vault passed **30/30** Foundry tests under Foundry `1.8.1`.
4. Vault creation bytecode is 7,657 bytes with SHA-256 `77ed1e8ab728fcb2221f04c88d4c01ac4625d157fb8f288cc9dd6ff8502ecb58`.
5. Vault runtime bytecode is 7,379 bytes with SHA-256 `4d6024fcdc89ea5529c3d9c3f1adbb7120790cdd5ef7b10a221759457064a141`.
6. Live Bradbury `eth_estimateGas` accepted **both** split deployment payloads while all transaction submission paths were blocked.
7. Reviewer gate passed **145/145** checks; ABI, manifest and hygiene gates passed.
8. Exact marker `=== STAGE 4E PASS ===` was produced.

## Stage 4F — live Bradbury deployment in progress

### Registry

Registry deployment succeeded and is Finalized.

- Address: `0x65c4acaD8Cfa4a531B5459e7C1f109443734860F`
- Deployment transaction: `0x87a72fa228f91c3f846cb09b0b08d7ec792e6f8c8eaf81515d0a191f3e1c2db2`
- Verified status: `Finalized` / status code `7`

### Adjudicator attempt 1 — failed execution

The first Adjudicator transaction was:

`0x01b7edddf5dcda53a6d6ff2b3a2ee2da1b191148d1c03b9248d81dc80bc23ea4`

Its proposed address was:

`0xfdB5213510eEE10c6cC5f46842Ace79468a368B0`

Consensus reached Accepted, but execution ended `FINISHED_WITH_ERROR`. No valid contract state exists at that proposed address, so it **must never be bound or used**.

The live trace identified the constructor boundary failure:

`Address(registry_address)` received an already-decoded GenLayer `Address`, causing `TypeError: cannot convert 'Address' object to bytes`.

The corrected constructor is:

`Address(str(registry_address))`

The exact pinned SDK locally reproduces the old failure and proves the corrected normalization preserves the Registry address.

Corrected Adjudicator artifact:

- bytes: **52,561**
- SHA-256: `d09c03112e0b3f42c5494bf9319f07f3813f001ba26f55f95807b8a814bf64a1`
- GenVM validation: passed
- Direct Mode total: **40/40**
- Vault tests: **30/30**
- reviewer gates: **145/145**
- Bradbury no-send estimate: accepted

No corrected Adjudicator redeployment has been sent yet.

## Still unverified / blocked

- Successful corrected Adjudicator deployment.
- Corrected Adjudicator execution result `FINISHED_WITH_RETURN`.
- Corrected Adjudicator finality.
- Registry binding to the successful finalized Adjudicator.
- Live dual-controller Vault deployment using the Finalized Registry and successful Adjudicator addresses.
- Registry → Vault binding.
- Adjudicator → Vault binding.
- Verification of all controller/back-reference relationships.
- Finalized live happy-path and dispute-flow execution evidence.
- Frontend migration from the old single-Core client to Registry + Adjudicator.
- Browser E2E against the exact deployed split addresses.
- Explorer/source/manifest/frontend/submission parity.

The failed Adjudicator proposed address `0xfdB5213510eEE10c6cC5f46842Ace79468a368B0` is not a valid deployment and must never be used in later Stage 4F operations.
