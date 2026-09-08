# VerdictGraph

**Accountability and deterministic settlement for autonomous workflow handoffs, adjudicated by GenLayer.**

VerdictGraph turns each handoff in an autonomous workflow into an explicit commitment: responsibility, exact breach criteria, authenticated evidence authorities, deadlines, escrow terms, and deterministic consequence rules. When a handoff is disputed, GenLayer validators independently retrieve the registered evidence and must agree exactly on the fields that can change downstream consequences.

## Why this is GenLayer-native

The frontend never decides whether a handoff breached. The adjudication contract uses a custom `gl.vm.run_nondet_unsafe` leader/validator pair; the validator independently re-fetches the same hash-pinned evidence, re-applies the registered criteria, and exactly compares consequential fields.

The model never chooses a payout amount, percentage, tolerance, or confidence-based split. It can only select one exact pre-registered consequence. `VerdictGraphVault` performs deterministic native-GEN arithmetic after finality-only Intelligent-Contract → EVM messages.

## Architecture

Bradbury rejected the original single 92,357-byte Intelligent Contract and progressively compacted 70,836, 69,197, 62,050, and 57,721-byte deployment variants with `BlockPubdataLimitReached`. VerdictGraph therefore preserves the security model by splitting the GenLayer layer instead of deleting reviewer-critical behavior.

```text
VerdictGraphRegistry.py (GenLayer IC)
- sealed issuer + publisher authority policy
- bounded workflow DAG + handoff commitments
- immutable delivery history
- dispute lock in the same state domain as requester acceptance
- finalized Vault registration / happy-path completion
- finalized, retryable case initialization message
          │ finalized child message
          ▼
VerdictGraphAdjudicator.py (GenLayer IC)
- immutable dispute revisions + responses
- authenticated evidence metadata / corroboration
- repairable fetch/hash/freshness failures
- independent custom validator
- exact policy-bound verdict
- bounded response / recovery windows
- finalized Vault dispute consequence
          │
          │ finality-only EVM messages
          ▼
VerdictGraphVault.sol (GenLayer Chain / EVM)
- immutable Registry controller for registration/completion
- immutable Adjudicator controller for dispute verdicts
- exact principal + provider bond
- deterministic consequence arithmetic
- idempotent processing
- deadline recovery
- pull withdrawals
```

`open_case` remains on Registry so a handoff is dispute-locked before the finalized child message initializes the Adjudicator. If that child does not complete, a case participant can retry the same finalized initialization instruction. The Vault independently retains a deadline-based `recover_active` escape path.

See [`docs/SPLIT_ARCHITECTURE_V1.md`](docs/SPLIT_ARCHITECTURE_V1.md).

## Reviewer-derived hard gates

- Approved issuer wallet addresses and approved HTTPS publisher boundaries are sealed into the evidence policy.
- V1 requires at least **2 distinct approved issuers and 2 distinct publisher origins** for a reviewable revision.
- Stable evidence IDs, versions, SHA-256 digests, issue/observation/expiry timestamps, case ownership and corroboration groups are bound on-chain.
- Failed evidence may return only as the same stable ID, from the same authenticated issuer, at a strictly higher version for the same case/handoff.
- Freshness and remaining validity are checked at registration and again at review time.
- Fetch/hash/UTF-8/size/staleness/response failures persist repairable state rather than silently terminating the case.
- Counter-evidence creates a fresh immutable revision and a fresh review; valid unaffected corroborators may be carried forward under the repair rules.
- Validators independently re-fetch/reason and exactly bind `decision`, `violated_rule_id`, `fault_class`, `consequence_rule_id`, and source-set digest.
- A reviewed result enters a bounded post-review response window before the exact latest verdict can be queued.
- Successful handoffs bypass AI adjudication: immutable provider delivery → explicit requester acceptance → finalized deterministic release.
- Registry completion, case initialization, and Adjudicator verdict messages are explicitly finalized and retryable/idempotent where applicable.
- Every funded Vault state has deterministic deadline recovery; withdrawals are pull-based and reentrancy-tested.
- Accepted/provisional state is never treated as final by the client model.

## Verified dependency baseline

Pinned/verified on **2026-09-06**:

- Python `3.12.14`
- GenVM dependency `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
- `genlayer-py` commit `a3dc35e04898e3889cbfa855bcaf7d2664675b8f`
- `genlayer-test` commit `9c09578b143905471fb0657dd53bdaf18da8e35f`
- `genvm-linter` commit `28450e665666300fc648dbe495110dfd0cb6a7b4`
- GenLayerJS exact source commit `1b7f50a3a3f2963ea857941b0fb386081dd5c326`
- Node `24.20.0`, npm `11.19.0`
- Next `16.3.4`, React/ReactDOM `19.2.8`, TypeScript `5.9.3`, viem `2.56.3`
- Foundry `1.8.1`, Solidity `0.8.20`

See [`docs/VERIFIED_BASELINE.md`](docs/VERIFIED_BASELINE.md).

## App routes

The frontend is migrated to explicit Registry + Adjudicator clients, hard-locks the exact audited Bradbury Registry, Adjudicator and Vault addresses, defaults protocol reads to finalized state, and verifies the full six-way deployment topology before Vault operations.

Public production frontend: [https://verdictgraph-mr-albert-s-projects.vercel.app](https://verdictgraph-mr-albert-s-projects.vercel.app)

Immutable Vercel deployment: [https://verdictgraph-q0sq7kbad-mr-albert-s-projects.vercel.app](https://verdictgraph-q0sq7kbad-mr-albert-s-projects.vercel.app)

Vercel deployment ID: `dpl_7GDonyn8pQVssP2cNM7rg3NF1Yta`.

## Verification commands

Core historical baseline and current split preparation are reproducible through the staged scripts. The active split verification is:

```bash
bash scripts/mac_stage4e_split_architecture_verify.sh
```

That script is intentionally non-destructive: it re-verifies both split IC deployment artifacts, the Direct Mode suite, the dual-controller Vault, source/ABI integrity, and live Bradbury `eth_estimateGas` for both ICs with signing/sending blocked.

## Current verification boundary

Completed before Stage 4E:

- Stage 1: canonical single-Core GenVM verification and **35/35 Direct Mode**.
- Stage 2: original Vault compile plus **29/29 Foundry tests**.
- Stage 3: reproducible frontend dependency install, TypeScript, Next production build, production audit **0 vulnerabilities**, source integrity and reviewer gates.
- Stage 4A: live Bradbury chain/PUSH0 compatibility proof.
- Stage 4B: keyless deployment preflight.
- One original Core deployment attempt failed before GenLayer deployment creation with `BlockPubdataLimitReached`; no successful Core address was created.
- Stage 4C: 70,836-byte exact-AST deployment artifact passed GenVM + 35/35 Direct Mode but Bradbury no-send estimate rejected it.
- Stage 4D: 69,197 / 62,050 / 57,721-byte candidates were all rejected by live Bradbury estimation with signing/sending blocked.

Stage 4E is **complete and verified on macOS**. Both split Intelligent Contract deployment payloads passed live Bradbury `eth_estimateGas` with signing/sending blocked; both ICs passed GenVM validation; Direct Mode passed **40/40** tests (35 canonical + 2 Registry + 3 Adjudicator); the dual-controller Vault passed **30/30** Foundry tests; and the reviewer gate passed **145/145** checks. The verified deployment artifacts are 43,424 bytes for Registry and 52,561 bytes for Adjudicator.

See [`docs/BUILD_STATUS.md`](docs/BUILD_STATUS.md).

Stage 4F through Stage 4AA live Bradbury verification is complete. The final deployed topology is Registry `0xCb031FbCEb219079608740fb77BC636F9447E7f5`, Adjudicator `0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868`, and dual-controller Vault `0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2`. Registry↔Adjudicator and both IC→Vault bindings were verified, and the Vault immutable controller getters point back to those exact IC addresses. Fresh happy-path and disputed handoffs reached terminal `SETTLED` state; the consequential settlement parent reached `Finalized` / status code `7`; both pull withdrawals succeeded; both claimable balances and final Vault balance are zero. The frontend now routes Registry and Adjudicator explicitly and fails closed unless all audited deployment addresses match.

## Reviewer submission links

Use only these final public links:

- Frontend: [https://verdictgraph-mr-albert-s-projects.vercel.app](https://verdictgraph-mr-albert-s-projects.vercel.app)
- Registry: [https://explorer-bradbury.genlayer.com/address/0xCb031FbCEb219079608740fb77BC636F9447E7f5](https://explorer-bradbury.genlayer.com/address/0xCb031FbCEb219079608740fb77BC636F9447E7f5)
- Adjudicator: [https://explorer-bradbury.genlayer.com/address/0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868](https://explorer-bradbury.genlayer.com/address/0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868)
- Vault: [https://explorer-bradbury.genlayer.com/address/0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2](https://explorer-bradbury.genlayer.com/address/0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2)
- Machine-readable Bradbury finality: [`deploy/bradbury.finality.json`](deploy/bradbury.finality.json)
- Machine-readable public-hosting evidence: [`deploy/public-hosting.finality.json`](deploy/public-hosting.finality.json)

## Submission rule

The repository, deterministic source-set identity, deployed Bradbury topology, frontend address locks, finalized economic evidence and public hosting evidence must remain aligned. The external submission form itself is the final human publication step: copy only the exact links above and re-open them immediately before submitting.
