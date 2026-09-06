# State machines

## Workflow

`DRAFT → ACTIVE → CLOSED`

Handoffs can only be added in `DRAFT`. Dependencies may only point from a lower handoff ordinal to a higher ordinal, making cycles impossible by construction. V1 bounds each workflow to 32 handoffs and each handoff to 16 dependencies.

## Handoff / delivery

```text
ACTIVE HANDOFF
  ├─ provider submits immutable delivery v1
  │      ├─ requester accepts
  │      │      ↓
  │      │  completion_queued = true
  │      │      ↓ finalized Registry→Vault message
  │      │  Vault SETTLED
  │      │      ↓ optional Registry sync
  │      │  vault_terminal_status = SETTLED
  │      │
  │      └─ participant opens dispute → Case lifecycle
  │
  └─ recovery horizon expires → neutral Vault recovery
```

A delivery integrity failure during review does not overwrite the old delivery. The provider can create a new immutable delivery version during `REPAIR_REQUIRED`; prior versions remain queryable.

If the finalized completion message fails or is underfunded while the Vault is still `ACTIVE`, either handoff participant may call `retry_handoff_completion`. The same exact idempotent instruction is emitted again. Retries stop once the Vault is terminal or the handoff recovery deadline has expired.

## Case / revision

```text
OPEN
 ├─ successful review → REVIEWED
 ├─ evidence/response/delivery failure → REPAIR_REQUIRED
 └─ application recovery deadline → RECOVERED

REVIEWED
 ├─ during post-review response window:
 │    participant response/counter-evidence → OPEN (new immutable revision)
 ├─ after response window:
 │    queue latest verdict → settlement_queued = true
 │       ├─ Vault remains ACTIVE → same exact settlement may be retried
 │       ├─ Vault SETTLED → sync_case_vault_status → SETTLED
 │       └─ Vault RECOVERED → sync_case_vault_status → RECOVERED
 └─ if never queued before recovery horizon → RECOVERED

REPAIR_REQUIRED
 ├─ transient fetch failure → retry same revision
 ├─ repaired evidence/response/delivery → OPEN (fresh revision where required)
 └─ repair deadline expires → RECOVERED
```


If the finalized Registry→Adjudicator initialization child does not complete, an authorized case participant can call `retry_case_initialization`. The receiver is idempotent for an already initialized case. If coordination never recovers, the Vault's public `recover_active` deadline remains the terminal escrow escape path; Registry can synchronize that terminal status with `sync_disputed_handoff_vault_status`.

When a fresh revision begins, `latest_verdict_id`, settlement attempt state and observed Vault terminal state are reset so no superseded verdict can be mistaken for the current consequence. Historical `Verdict`, `EvidenceRecord` and `DeliveryRecord` objects remain addressable for auditability.

`queue_settlement(case_id, expected_verdict_id)` initially succeeds only when:

- case state is `REVIEWED`;
- `expected_verdict_id == latest_verdict_id` and is nonzero;
- the post-review response window has closed;
- the application recovery deadline has not expired;
- the verdict belongs to the current case revision.

Once queued, the same function may re-emit the exact latest settlement only while the bound Vault still reports `ACTIVE` and the recovery deadline has not expired. The Vault is idempotent for duplicate case messages.

## Vault

```text
NONE
 ↓ finalized Registry registration
REGISTERED
 ├─ exact requester principal before funding deadline → FUNDED
 └─ funding deadline → RECOVERED

FUNDED
 ├─ exact provider bond before funding deadline → ACTIVE
 └─ funding deadline → RECOVERED (requester principal claimable)

ACTIVE
 ├─ finalized accepted-delivery instruction → SETTLED
 ├─ finalized dispute consequence → SETTLED
 └─ recovery deadline → RECOVERED (neutral principal/bond return)
```

`SETTLED` and `RECOVERED` are terminal. Late/duplicate completion and verdict messages cannot reopen terminal escrow. Withdrawals use claimable balances and a pull pattern.
