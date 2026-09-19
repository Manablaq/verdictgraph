# Milestone Settlement Protocol

## What this release adds

The milestone protocol is a split three-contract GenLayer layer plus a
single-purpose deterministic EVM Vault. It turns an accepted project baseline
into a new, objectively reviewable commitment:

## Review-document encoding requirement

The GenLayer adjudicator retrieves the registered baseline, acceptance record,
and submitted evidence as bounded text documents. Each document must be a
public HTTPS response of at most 48,000 bytes, hash exactly to its registered
SHA-256, and decode as UTF-8. A repository archive such as a `.tar.gz` may be
recorded inside a UTF-8 manifest as predecessor identity, but it must not be
registered as the baseline document itself. The frontend authority form
preflights both primary and mirror bytes before sending the irreversible
write-once registration transaction.

1. The Authority IC lets only the deployment-selected acceptance authority
   register a project reference, immutable accepted baseline URI and SHA-256
   digest, a distinct hash-pinned baseline mirror, and a hash-pinned acceptance
   record with its own mirror. Those four URLs derive an authority-controlled
   public HTTPS origin allowlist for later submissions.
2. The sponsor references an Authority snapshot through the Registry IC and
   registers exact success criteria, parties, deadlines, and principal/bond
   terms. The Registry stores the lifecycle and terms; it cannot replace the
   Authority trust root.
3. The beneficiary submits versioned work with a second hash-pinned URI. Both
   parties can mark the revision ready. The Registry finalizes a review request
   to the Adjudicator IC, which independently retrieves the baseline,
   acceptance record, and submission, trying each pinned mirror after a
   primary fetch failure and hash-verifying every successful source.
4. The Adjudicator's leader and validator must agree on the exact decision,
   failed criterion, consequence rule, and source-set digest. The Registry
   accepts only an authenticated, current, finalized callback. The reviewer
   summary is retained for human readability but is not part of the
   payout-authorizing digest.
5. A bounded challenge window can reopen the review. A challenge produces a
   fresh review with the incremented challenge count. A pending finalized
   callback can be retried safely because the Adjudicator caches the exact
   result for each milestone/request pair.
6. After the window closes, the Registry emits only the exact finalized
   consequence to the Vault. If the recovery deadline expires first, the
   Registry or any user can use the Vault's dedicated `recover_active`
   transition; a late outcome is ignored. The Vault releases or refunds fixed
   amounts; it never evaluates evidence or performs model arithmetic.

The three outcomes are fixed:

| Decision | Consequence rule | Exact economic effect |
| --- | ---: | --- |
| `PASS` | `1` | Beneficiary receives principal + bond |
| `FAIL` | `2` | Owner receives principal + bond |
| `UNDETERMINED` | `3` | Owner receives principal; beneficiary bond returns |

There are no percentage payouts, confidence thresholds, client-side verdicts,
or arbitrary external settlement calls.

## Canonical compact wire formats

The Registry-to-Adjudicator view is deliberately an ordered JSON vector so the
Bradbury deployment payload remains under the provider envelope. Its 19 fields
are fixed and must never be reordered: `[milestone_id, request_id,
project_ref, title, objective, criteria_json, baseline_uri,
baseline_sha256, baseline_mirror_uri, acceptance_record_uri,
acceptance_record_sha256, acceptance_record_mirror_uri, submission_version,
submission_uri, submission_sha256, challenge_count, challenge_text,
terms_sha256, recovery_deadline]`.

The Registry and Adjudicator calculate the review digest over the same ordered
7-item vector: `[milestone_id, submission_version, challenge_count, decision,
failed_criterion_id, consequence_rule_id, source_set_sha256]`. The milestone
terms digest is calculated over the ordered 22-item creation vector: milestone
id, project/reference identity, sponsor/owner/beneficiary, title/objective,
Authority baseline and acceptance evidence identities, submission origins,
normalized criteria, principal/bond, and all four deadline/window values. These
vectors are transport/hash formats, not user-editable policy.

The split Registry returns short deterministic error codes to keep its
Bradbury artifact within the network gas envelope. Clients should display a
generic failure plus the code and use this table for diagnostics:

| Codes | Meaning |
| --- | --- |
| `E1`–`E4` | Hash/text/HTTPS-host validation |
| `E5`–`E10` | Submission-origin JSON and criteria validation |
| `E11`–`E13` | Review decision/consequence validation |
| `E14`–`E16` | Constructor, milestone existence, participant checks |
| `E18`–`E26` | One-shot Adjudicator/Vault binding and reciprocal checks |
| `E28`–`E39` | Accepted-project, sponsor, party, amount, and deadline checks |
| `E40`–`E50` | Activation, escrow registration, submission, readiness, and review queue |
| `E51`–`E59` | Review lifecycle and challenge-window checks |
| `E60`–`E68` | Authenticated callback, receipt, repair, digest, and collision checks |
| `E69`–`E71` | Review context, submission, and Authority snapshot checks |
| `E72`–`E76` | Settlement/recovery status and deadline checks |
| `E77`–`E80` | Unknown reference/submission/review/challenge lookups |

`E17` and `E27` are retired internal slots; no current public path emits them.

## State machine

```text
DRAFT ──activate──> ACTIVE ──submit──> SUBMITTED
  │                    │                 │
  │                    │                 └─review──> REVIEW_PENDING ──callback──> REVIEWED
  │                    │                                  │
  │                    │                                  ├─challenge──> CHALLENGED
  │                    │                                  │                   │
  │                    │                                  │                   └─review──> REVIEW_PENDING
  │                    │                                  │
  │                    │                                  └─window closes──> settle
  │                    │
  │                    └─hash/fetch failure──> REPAIR_REQUIRED ──new version──> SUBMITTED
  │
  └─expired escrow recovery is handled by the deterministic Vault
```

`SETTLED` and `RECOVERED` are terminal economic states in the Vault. A finality
message is idempotent: duplicate delivery cannot pay twice, and a message sent
before the escrow is active is ignored without consuming the milestone.

## Trust and security boundaries

- The acceptance authority is an on-chain write-once trust root selected in the
  Authority constructor. A milestone cannot self-claim that it belongs to an
  accepted project: its baseline and acceptance record are inherited through
  the Registry's Authority view.
- The baseline and every submission are stored with strict lowercase
  SHA-256 digests. Validators hash the fetched bytes before decoding them.
- HTTPS, response status, UTF-8 validity, and a bounded document size are
  checked before the model sees evidence.
- URLs reject IP literals, credentials, non-default ports, localhost/private
  host patterns, and submission origins not registered by the acceptance
  authority. Baseline and acceptance mirrors must be distinct and are used
  only after the primary source fails verification or availability checks.
- Milestone creation enforces minimum funding, submission, recovery, and
  challenge windows plus a one-year maximum recovery horizon. These bounds are
  enforced in the Intelligent Contract and mirrored in the client form.
- Evidence text and challenge text are explicitly marked untrusted in the
  review prompt; instructions inside them are not protocol instructions.
- The validator re-runs the same fetch-and-review path. It does not accept a
  leader-selected shape or decision.
- A repairable fetch or hash failure persists a failure code and observed
  digest, so the beneficiary can submit a higher version without erasing the
  failed attempt.
- The Registry's Adjudicator and Vault bindings are one-shot. Registration,
  review, challenge resolution, settlement retry, and recovery are
  permissionless where the state machine permits them, so a stalled participant
  does not permanently block liveness. The frontend verifies every split edge,
  all three exact deployment-artifact digests, and the deployed Vault runtime
  hash before reads that drive the milestone UI and before every write.
- Each split IC receives its exact generated deployment-artifact SHA-256 at
  deployment and exposes it from finalized state. Each artifact is generated
  from its canonical source by a reversible AST/public/storage parity-checked
  build step and preserves diagnostics. This does not replace source review,
  but it prevents the published UI from silently pairing a deployment with a
  different transport artifact.
- The Vault has one immutable controller, exact terms matching, bounded
  states, duplicate protection, deadline recovery, pull withdrawals, and a
  reentrancy guard.

This protocol proves that the fetched bytes and finalized decision match the
registered commitment and that the commitment was rooted in the configured
acceptance authority. It does not prove that a URL is independently
authoritative beyond that authority's signed/on-chain assertion, nor that two
parties are economically independent.

## Frontend release

- `/milestones` lists finalized milestones.
- `/milestones/create` registers a new commitment.
- `/milestones/[id]` exposes participant actions and the escrow state.
- `/milestones/[id]/proof` produces a wallet-free, shareable JSON/print Proof
  Pack containing the baseline, mirrors, submission, review, challenge history,
  deployment identity, exact consequence, exact Vault escrow terms, and a
  latest live Vault read anchored to an EVM block number and hash. Its schema
  distinguishes a finalized chain read from a protocol `reviewed` state; a
  milestone without a review is explicitly `provisional`.

The UI reads finalized GenLayer state by default and fails closed unless the
milestone Authority, Registry, Adjudicator, Vault, all three deployment-artifact
SHA-256 values, and expected Vault runtime SHA-256 environment variables are
present. It also requires reciprocal on-chain topology and runtime-identity
verification. The existing deployed Registry/Adjudicator/Vault is not reused
as a fake milestone deployment.

## Verification

Run the release-specific gate from the repository root:

```bash
npm run milestone:verify
```

That command runs source gates, pinned GenVM lint/type checks, the isolated
Direct Mode suites for all three milestone ICs, Solidity compilation, Foundry
economic/security tests, TypeScript, and the production frontend build. The
current suite covers authority-gated project provenance, unique reference
lookup, exact PASS/FAIL/UNDETERMINED payouts, duplicate finality, pending
callback retry, deadline recovery, malformed input, hash-mismatch and
oversized-review repair, validator disagreement, and challenge attribution/
re-review.

## Bradbury deployment boundary

The implementation and verification package is ready, and the corrected
milestone topology is finalized on Bradbury. The deployment record
[`deploy/milestone-bradbury.template.json`](../deploy/milestone-bradbury.template.json)
is marked `DEPLOYED`: the real Authority, Registry, Adjudicator and Vault
addresses, finalized deployment receipts, finalized one-shot bindings,
reciprocal reads, and constructor-specialized runtime identity are recorded.
The template records canonical and generated artifact identities plus the
constructor-specialized Vault runtime identity. The published frontend receives
each exact generated artifact digest in its split source environment variables.
The keyless three-IC and Vault estimate probes were rerun against this exact
release before publication; they use `eth_estimateGas` only and never read a
private key or submit a transaction.

The canonical accepted-project trust root is finalized on Bradbury. The funded
acceptance authority registered `verdictgraph-v2` in GenLayer transaction
`0xa520fd9e232743495914a9f300b76505a19a219869427445478efb2f1102cb50`.
The finalized Authority reads `get_project_count() = 1` and the exact
`verdictgraph-v2` baseline, acceptance-record, sponsor, and approved-origin
values recorded in `deploy/milestone-bradbury.template.json`. This makes the
public milestone creation flow usable by the authorized sponsor without
weakening the authority gate.

Final milestone topology:

- Authority: `0x7e68D3951227D409FAD3255D7D9Fe0DB0C7E4966`
- Registry: `0x647bcaCe50b8137fEad0caAf48a5E1B15D36854D`
- Adjudicator: `0xFcfda4EE1b8bE66F7E9EEf887c744a704cF7F0F0`
- Vault: `0x99717eD8040890B164BD62007d887EA7d9Cc8b2E`

The deployment record is the canonical machine-readable evidence. This keeps
the milestone feature tied to real finalized Bradbury state rather than an
unreviewed or fabricated address.

### Historical proof artifacts

`frontend/public/milestones/milestone-1-evidence-v1.json` and
`milestone-2-evidence-v1.json` are preserved byte-for-byte as historical
evidence for superseded milestone deployments. They are **not** the canonical
current topology and must not be edited in place because their bytes may be
hash-pinned by historical on-chain records. The current publication topology
is the one in `deploy/milestone-bradbury.template.json`.
