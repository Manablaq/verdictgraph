# Reviewer-readiness hard gates

A submission is blocked if a required item below is false. Checked items are supported by the repository's reproducible gates and/or persisted Bradbury/public-hosting evidence. The external submission-form entry itself intentionally remains a submission-time human check.

## Evidence and trust

- [x] Approved evidence authorities are policy-bound on-chain; the live reviewer flow used the two approved issuer accounts recorded in the Stage 4 live evidence.
- [x] At least two distinct approved issuers were used in the fresh reviewer flow.
- [x] At least two distinct HTTPS publisher origins were required and used.
- [x] Consequential evidence is versioned/byte-pinned and bound to stable evidence identifiers.
- [x] Freshness and expiry are rechecked at review time.
- [x] Revision evidence is bound to its corroboration group.
- [x] Corroboration requires distinct stable records and distinct content digests.
- [x] Fetch/hash failures persist as repairable state.
- [x] Stable-record repair requires a higher version from the same authenticated issuer while valid unaffected corroborators can be carried forward.

## Consensus

- [x] Leader and validator independently evaluate fetched evidence.
- [x] Validator disagreement tests reject contradictory consequential outputs.
- [x] Exact `decision`, `violated_rule_id`, `fault_class`, `consequence_rule_id`, and source-set digest are consensus-bound.
- [x] No economic percentage/tolerance permits different consequences to validate.
- [x] Prompt-injection regressions treat evidence and party responses as untrusted content.

## Liveness and settlement

- [x] Every funded Vault state has a deadline escape/recovery path.
- [x] Case review and repair horizons cannot outlive handoff recovery.
- [x] Finalized Registry→Adjudicator initialization is retryable/idempotent.
- [x] Registry + Adjudicator → Vault bindings are proven and Vault immutable controllers equal the exact final IC addresses.
- [x] Reviewed verdicts enter a bounded post-review response window before settlement.
- [x] Fresh revision state supersedes the previous verdict and blocks settlement of superseded state.
- [x] `queue_settlement` binds the exact latest verdict; the fresh settlement parent is Finalized/status `7`.
- [x] Duplicate/late settlement effects are idempotent.
- [x] Failed finalized completion/settlement messages are retryable while Vault state remains recoverable.
- [x] Registry/Adjudicator terminal state can synchronize from deterministic Vault terminal state.
- [x] Registry and Adjudicator writes use SDK fee estimation and preserve message allocations.
- [x] Repeated identical Vault registration is idempotent and changed terms are rejected.
- [x] Withdrawals are pull-based and covered by failure/reentrancy tests.

## Finality / UX

- [x] UI distinguishes finalized state from explicitly accepted/provisional state.
- [x] UI distinguishes contract state from consensus status.
- [x] UI never presents `Accepted` as final/permanent.
- [x] Successful write flows verify execution result rather than consensus status alone.
- [x] Finality is required before irreversible economic outcome presentation.

## Deployment/source parity

- [x] `scripts/reviewer_gate.py` passes: **152/152**.
- [x] `scripts/verify_manifest.py` passes.
- [x] Deterministic reviewer source identity and deployment bindings are persisted in `verification/source-manifest.json`.
- [x] Canonical live-evidence navigation for the final Bradbury proof is persisted in `verification/live/CANONICAL_EVIDENCE.json`.
- [x] GenVM validation passed on the exact deployed Registry and Adjudicator source.
- [x] Direct Mode passed on the exact deployed split source.
- [x] Solidity Vault compile/tests passed on the exact deployed Vault source.
- [x] Final Bradbury Registry and Adjudicator addresses match the persisted topology evidence.
- [x] Final Vault and immutable `registry_core` / `adjudicator_core` values match the persisted topology evidence.
- [x] Deployed contract source is byte-stable relative to deployment commit `0e2855d14e142edc6e215c5935f3993eee59be21`; post-deployment frontend/docs work does not modify contract source.
- [x] Frontend accepts only the exact final Registry, Adjudicator and Vault addresses and verifies all six topology edges.
- [x] Final public frontend and Bradbury Explorer address links were rechecked during final packaging and point only to the exact audited deployments.
- [x] Public production frontend is `https://verdictgraph.vercel.app`, backed by READY production deployment `dpl_AbR6NaKBN81UB8g7jxcpj4cU7NaS` from exact deployed frontend source commit `46b636ffd4449234362d7cc78a8a0242a62ac755`.
- [x] Public-hosting evidence is persisted in `deploy/public-hosting.finality.json`.
- [ ] The external submission form itself must be populated with the exact final links below immediately before the user submits it.

## Final Bradbury topology

- Registry: `0xCb031FbCEb219079608740fb77BC636F9447E7f5`
- Adjudicator: `0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868`
- Vault: `0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2`

The machine-readable finality record is `deploy/bradbury.finality.json`.

## Final public links

- Frontend: `https://verdictgraph.vercel.app`
- Registry Explorer: `https://explorer-bradbury.genlayer.com/address/0xCb031FbCEb219079608740fb77BC636F9447E7f5`
- Adjudicator Explorer: `https://explorer-bradbury.genlayer.com/address/0x1B6d96aEc7A80ab582Afd9cb1eC182F197502868`
- Vault Explorer: `https://explorer-bradbury.genlayer.com/address/0x9B6459aE8045cC4afa0bef0A9868DB46369a70C2`
- Public-hosting evidence: `deploy/public-hosting.finality.json`
- Deterministic source manifest: `verification/source-manifest.json`
- Canonical live-evidence index: `verification/live/CANONICAL_EVIDENCE.json`
