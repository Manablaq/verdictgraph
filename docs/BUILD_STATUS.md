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

## Stage 4F–4AA — live Bradbury deployment and end-to-end proof complete

The final Bradbury topology is:

- Registry: `0xCb031FbCEb219079608740fb77BC636F9447E7f5`
- Adjudicator: `0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868`
- Vault: `0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2`

Final deployment/binding transactions:

- Registry deployment: `0x115417d925140b03dddbea6e5a6137c846ddb0778e4b9d45641e1a7e9762c8d6`
- Adjudicator deployment: `0x89a572ef5a68b37c09353c1939b8785e8caa019294b18c9b785b2825d91c12c7`
- Registry → Adjudicator binding: `0xaf07125aa16c94900629fadb7c88821a80c566278cc7e140cd25ee939be2b1e6`
- Vault deployment: `0x346da1c607bead1157cbfe0760b3bfb131bea922f311e9359ea109b6de14b321`
- Registry → Vault binding: `0x714ea444b88affe6387206d824b57a32b56cf14b914ce767d76e5a9c8dd07866`
- Adjudicator → Vault binding: `0x3ee2166841437cc933328ac7f500ca3d2c04ff96e5051a5facdecca64950e3d4`

Verified six-way topology:

1. Registry → Adjudicator equals the final Adjudicator.
2. Adjudicator → Registry equals the final Registry.
3. Registry → Vault equals the final Vault.
4. Adjudicator → Vault equals the final Vault.
5. Vault `registry_core()` equals the final Registry.
6. Vault `adjudicator_core()` equals the final Adjudicator.

Fresh end-to-end reviewer proof:

- happy-path completion retry parent is `Finalized` / status code `7`;
- evidence A and B registration parents are `Finalized` / status code `7`;
- requester-ready and provider-ready parents are `Finalized` / status code `7`;
- case 2 resolution parent is `Finalized` / status code `7`;
- case 2 settlement parent `0x0070d5452c6fd68d4ce2ef84c32b87172519dd1e8635e8f3d615425a2f9b6777` is `Finalized` / status code `7`;
- fresh happy handoff 3 and disputed handoff 4 are both Vault status `SETTLED (4)`;
- provider withdrawal `0xeb4f81ca0966127f8a33307b154cf1aebc7567e5815de42e9fb35a609b5079db` succeeded;
- requester withdrawal `0x158a5da046c6a15bf33c4d491fe0c9a3d61111c8c0b71813496eff8a54e79116` succeeded;
- provider claimable = `0`;
- requester claimable = `0`;
- Vault native balance = `0`.

The exact deployed Intelligent Contract source remains the source committed at `0e2855d14e142edc6e215c5935f3993eee59be21`. Post-deployment frontend/reviewer-documentation changes do not modify `contracts/` or `evm/contracts/`.

The frontend has been migrated from the temporary single-Core abstraction to explicit Registry and Adjudicator clients. It hard-locks the exact final Registry, Adjudicator and Vault addresses and verifies the full six-way topology before Vault operations.

Current reviewer gate: **152/152**.

Current deterministic source identity is recorded in `verification/source-manifest.json`.

## Remaining submission packaging

The on-chain/economic proof is complete. Remaining work is packaging only:

- deploy/test the final frontend build in the intended public hosting environment if required;
- recheck public Explorer/frontend URLs;
- ensure the final submission form links point only to the exact Registry, Adjudicator, Vault and final frontend deployment.
