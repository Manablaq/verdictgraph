# Reviewer-readiness hard gates

A submission is **blocked** if any item below is false.

## Evidence and trust

- [ ] Approved real-world evidence authorities are explicitly documented and their on-chain issuer addresses match the sealed policy.
- [ ] At least two genuinely independent approved issuers are used in the reviewer demo.
- [ ] At least two genuinely independent approved publishers are used.
- [ ] Every consequential source is immutable/versioned or byte-pinned with a stable record ID.
- [ ] Freshness/expiry remains valid at the actual review transaction time.
- [ ] All sources for the revision share the intended corroboration group.
- [ ] Corroborating records use different stable IDs and different content digests; duplicate bytes do not satisfy corroboration.
- [ ] Fetch/hash failures demonstrably persist as repairable state.
- [ ] The failed stable evidence record is repaired with the same stable ID, a strictly higher version, and the same authenticated issuer; unaffected corroborators are carried forward.

## Consensus

- [ ] Leader and validator independently fetch/review evidence.
- [ ] Validator disagreement test proves contradictory consequential outputs are rejected.
- [ ] Exact `decision`, `violated_rule_id`, `fault_class`, `consequence_rule_id`, and source-set digest are validator-bound.
- [ ] No tolerance allows two different economic consequences to validate.
- [ ] Prompt-injection regressions treat evidence/party responses as untrusted content.

## Liveness and settlement

- [ ] Every funded Vault state has a deadline escape path.
- [ ] Case review and repair paths cannot outlive the handoff recovery horizon.
- [ ] Finalized Registry→Adjudicator case initialization is retryable/idempotent and cannot leave escrow without the Vault recovery deadline escape.
- [ ] Registry + Adjudicator → Vault bindings are proven on Bradbury and `registry_core` / `adjudicator_core` equal the exact deployed ghost addresses.
- [ ] Reviewed verdict enters the bounded post-review response window before settlement can be queued.
- [ ] A fresh revision resets the current verdict and prevents the superseded verdict from settlement.
- [ ] `queue_settlement` binds the exact latest verdict and its finality-only message is proven on Bradbury.
- [ ] Duplicate/late settlement messages are idempotent.
- [ ] A failed/underfunded finalized completion or settlement message can be retried while the Vault remains ACTIVE and before recovery expiry.
- [ ] Registry/Adjudicator terminal state can be synchronized from deterministic Vault `SETTLED`/`RECOVERED` status.
- [ ] Registry and Adjudicator writes use verified fee estimation and preserve child/external-message fee allocations; no guessed fee fallback is used.
- [ ] Repeated identical handoff registration is idempotent; changed terms are rejected.
- [ ] Withdrawals are pull-based and tested for failure/reentrancy behavior.

## Finality / UX

- [ ] UI distinguishes finalized explorer state from explicitly labeled accepted/provisional workspace state.
- [ ] UI distinguishes contract state from consensus status.
- [ ] UI never labels `Accepted` as permanent/final.
- [ ] Successful paths verify `FINISHED_WITH_RETURN`, not consensus status alone.
- [ ] Appeal/finality path is visible before irreversible outcome presentation.

## Deployment/source parity

- [ ] `scripts/reviewer_gate.py` passes.
- [ ] `scripts/verify_manifest.py` passes.
- [ ] GenVM lint/typecheck passes on the exact deployed source.
- [ ] Direct Mode suite passes on the exact deployed source.
- [ ] Solidity Vault compiles/tests from the exact deployed source.
- [ ] Bradbury Registry and Adjudicator addresses match the deployment manifest.
- [ ] GenLayer Chain dual-controller Vault address and both immutable controller getters match the deployment manifest.
- [ ] Explorer source matches repository commit and SHA-256 manifest.
- [ ] Frontend points only to those exact addresses.
- [ ] Submission links point only to those exact deployments.
