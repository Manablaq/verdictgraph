# Architecture

VerdictGraph uses two GenLayer Intelligent Contracts plus one deterministic EVM Vault. The split exists because Bradbury rejected the verified single-contract source and multiple compacted deployment variants with `BlockPubdataLimitReached`; reviewer/security controls are preserved rather than deleted to fit transport limits.

## VerdictGraphRegistry — GenLayer Intelligent Contract

Registry owns the state whose race conditions must stay in one domain:

- sealed evidence policies, issuer addresses, publisher prefixes and policy fingerprints;
- bounded workflow DAG and exact handoff commitments;
- immutable/versioned provider deliveries;
- exact criteria → consequence mappings;
- requester delivery acceptance;
- `handoff_case_id` dispute lock;
- immutable case-context snapshot used by the Adjudicator;
- finalized, idempotent Vault registration/happy-path completion instructions;
- finalized, retryable Adjudicator case-initialization instruction;
- terminal Vault synchronization for happy-path and disputed handoffs.

`open_case` writes the dispute lock before it emits the finalized child initialization message. Therefore the requester cannot race a dispute against direct delivery acceptance.

## VerdictGraphAdjudicator — GenLayer Intelligent Contract

Adjudicator owns dispute judgment state:

- cases and immutable revisions;
- authenticated evidence metadata and party responses;
- repairable evidence/response/delivery failures;
- higher-version evidence repair rules;
- independent `gl.vm.run_nondet_unsafe` leader/validator review;
- exact policy-bound verdict fingerprints;
- bounded post-review response window and recovery deadlines;
- retryable finalized dispute-settlement messages;
- deterministic Vault terminal synchronization.

Evidence authority is not duplicated as a mutable trust list in Adjudicator. At registration it synchronously reads the sealed issuer/publisher authorization from Registry. At review time it synchronously reads the current immutable delivery snapshot from Registry, so a permitted delivery repair is bound to the reviewed version/hash.

Adjudicator never calculates an arbitrary payout. It chooses only an exact consequence rule already registered in the handoff criteria.

## VerdictGraphVault — deterministic EVM contract

Vault owns native-GEN custody and arithmetic. It has two immutable controllers:

- `registry_core` — exclusively authorized for `register_handoff` and `apply_handoff_completion`;
- `adjudicator_core` — exclusively authorized for `apply_final_verdict`.

It also provides:

- exact requester principal and provider bond;
- funding and maximum recovery deadlines;
- duplicate-safe registration/completion/verdict processing;
- neutral deadline recovery via `recover_unactivated` / `recover_active`;
- pull withdrawals with local reentrancy protection.

Both ICs refuse to bind an arbitrary Vault. Registry and Adjudicator each synchronously read **both** immutable controller getters and require them to match the exact deployed Registry and Adjudicator ghost addresses.

## Frontend

The frontend is a client, never an adjudication authority. The Stage-3 production build is verified, but its current wiring still targets the historical single-Core interface. Split Registry/Adjudicator client migration and browser E2E are required before live deployment/submission parity can be claimed.

The final client must:

- read finalized state or explicitly label latest-nonfinal state;
- require `FINISHED_WITH_RETURN` as well as consensus finality for successful writes;
- use the exact pinned fee-aware GenLayerJS commit and simulation-backed fee estimation;
- preserve child-message fee allocations;
- use direct EVM transactions for Vault funding/bond/recovery/withdrawal;
- expose initialization, delivery, authority, evidence, repair, retry, finality and Vault terminal state;
- never substitute unlabeled illustrative data for missing chain state.

## Successful-handoff lifecycle

```text
policy sealed → workflow/handoff → workflow active
  ↓
finalized Registry registration → Vault REGISTERED
  ↓ exact requester principal
FUNDED
  ↓ exact provider bond
ACTIVE
  ↓
provider submits hash-pinned delivery
  ↓ requester explicitly accepts in Registry
Registry marks completion queued / handoff inactive
  ↓ finalized Registry → Vault message
Vault SETTLED → provider claimable = principal + bond
  ↓
withdraw
```

If the finalized completion message does not reach the Vault, a participant can re-emit the same idempotent instruction while the escrow is `ACTIVE` and before recovery expiry.

## Disputed-handoff lifecycle

```text
Vault ACTIVE
  ↓
Registry.open_case
  ├─ writes handoff_case_id dispute lock
  ├─ stores immutable case context
  └─ emits initialize_case(case_id) on finalized
        ↓
Adjudicator OPEN
  ↓
response + authenticated evidence + review
  ↓
REVIEWED (exact latest verdict)
  ↓
bounded post-review response window
  ├─ counter-evidence → fresh revision → fresh review
  └─ window closes
        ↓
queue_settlement(latest_verdict_id)
        ↓ finalized Adjudicator → Vault message
Vault exact consequence once
        ↓
claimable balances → withdrawals
```

If case initialization is not observed, an authorized case participant may retry the same finalized initialization message. If application coordination fails all the way to the escrow recovery horizon, the public Vault `recover_active` path still returns principal and bond neutrally. Registry can then synchronize the terminal Vault state.

## Exact consequence templates

1. `RELEASE_PROVIDER`: provider receives principal + own bond.
2. `PROVIDER_BREACH`: requester receives principal + provider bond.
3. `NEUTRAL_RECOVERY`: requester receives principal; provider receives own bond.

No model-selected arithmetic, percentages, tolerance bands or confidence-based payout exists.

## Deployment order

1. Deploy Registry.
2. Deploy Adjudicator with the exact Registry address.
3. Registry binds Adjudicator after verifying its immutable Registry back-reference.
4. Deploy Vault with exact Registry and Adjudicator ghost addresses.
5. Registry binds Vault and verifies both controller getters.
6. Adjudicator binds Vault and verifies both controller getters.
7. Verify finalized reads, code/source hashes and deployment records before enabling the frontend.

Stage 4E performs no deployment; it first requires live no-send Bradbury gas-estimation acceptance for both exact IC deployment artifacts.
