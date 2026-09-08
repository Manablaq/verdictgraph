# VerdictGraph Split Intelligent-Contract Architecture v1

Bradbury rejected the original single `VerdictGraphCore` deployment and progressively compacted 70,836, 69,197, 62,050, and 57,721 byte variants with `BlockPubdataLimitReached`. Stage 4E therefore splits responsibilities instead of weakening reviewer/security controls.

## Components

- `VerdictGraphRegistry` — evidence policies, workflow graph, handoffs, immutable delivery history, dispute locking, creator-scoped IDs, and finalized handoff registration/completion messages to the Vault.
- `VerdictGraphAdjudicator` — dispute revisions, evidence provenance/corroboration, independent nondeterministic review, exact consensus-to-consequence binding, repair/recovery, and finalized verdict messages to the Vault.
- `VerdictGraphVault` — deterministic native-GEN custody and exact arithmetic. It authenticates two immutable controllers: Registry for registration/happy-path completion and Adjudicator for dispute verdicts.

## Dispute handoff

`open_case` remains on Registry. Registry sets `handoff_case_id` and stores an immutable case-context snapshot before emitting `initialize_case(case_id)` to Adjudicator with `on="finalized"`. This prevents a disputed handoff from being directly accepted in the same state domain that owns delivery acceptance. The Adjudicator accepts initialization only when `gl.message.sender_address` is the bound Registry.

The case context binds policy fingerprint and thresholds, workflow identity/title/mission, requester/provider, criteria, deadlines and the original claim. Evidence issuer/publisher authorization is still checked synchronously against sealed Registry policy state. Delivery metadata is read synchronously from Registry at review time so a permitted delivery repair is reviewed by exact current version/hash.

Initialization is a liveness-managed handoff, not a one-shot assumption. An authorized case participant can call `retry_case_initialization(case_id)` before the case recovery deadline; Adjudicator initialization is idempotent. If cross-contract coordination never completes, the Vault's public `recover_active` path still returns principal and bond neutrally after the maximum escrow recovery deadline, and Registry can synchronize that terminal state.

## Vault authorization

- `register_handoff` — Registry only.
- `apply_handoff_completion` — Registry only.
- `apply_final_verdict` — Adjudicator only.

Registry and Adjudicator use owner-only, one-shot Vault bindings. The Vault independently authenticates its immutable Registry and Adjudicator controllers on every consequential call, while deployment verification proves those immutables and the IC bindings form the exact six-way topology. External EVM effects are explicitly emitted with `on="finalized"`; Registry and Adjudicator never rely on accepted-stage EVM effects.

## Deployment order

1. Deploy Registry.
2. Deploy Adjudicator with Registry address.
3. Bind Adjudicator in Registry after synchronous back-reference verification.
4. Deploy Vault with Registry and Adjudicator ghost addresses.
5. Bind Vault in Registry and Adjudicator through their owner-only, one-shot endpoints, then independently verify both Vault immutable controller getters and the complete six-way topology.
6. Verify finalized state and source hashes before enabling the frontend.

No deployment occurs in Stage 4E; it performs keyless Bradbury gas estimation for both exact deployment artifacts first.
