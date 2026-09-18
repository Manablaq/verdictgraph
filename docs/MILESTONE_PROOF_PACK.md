# Milestone release: Public Proof Packs

## What changed

VerdictGraph now includes public, wallet-free publication surfaces at:

```text
/cases/:caseId/proof
```

The case page links to the Proof Pack with a visible `Proof Pack` action. A user can share the URL with a reviewer, export a machine-readable JSON record, or print the same record as a review-ready dossier.

The milestone page adds the same publication contract at
`/milestones/:id/proof`. Milestone packs use schema v4: a finalized GenLayer
chain read is distinguished from a protocol `reviewed` or `provisional` state,
authority-registered mirrors and submission origins are included, and the live
Vault escrow read is anchored to an EVM block number and hash.

## Why this is meaningful new progress

The accepted VerdictGraph baseline proved the underlying Registry → Adjudicator → Vault settlement path. The Proof Pack turns that protocol state into a reusable product capability for grant operators, workflow participants, reviewers, and integrators:

- one public surface joins the workflow, handoff, policy, evidence, revision, verdict, and Vault records;
- verification checks make the important trust boundaries legible to a non-developer reviewer;
- the selected accepted/finalized snapshot is labelled explicitly, so a provisional state cannot be published as permanent;
- the export is deterministic: canonical JSON key ordering is hashed into a local Proof Pack digest;
- the dossier links to the exact audited Bradbury Registry, Adjudicator, Vault, and evidence sources;
- the print view removes controls and uses a light, pagination-friendly layout for grant or audit attachments.

This is a new publication and audit workflow, not a resubmission of the original case-management UI.

## Included verification surface

The Proof Pack reports:

- sealed policy status and policy fingerprint;
- required versus observed distinct issuer and publisher corroboration;
- current immutable revision and evidence records;
- provider delivery hash when a delivery exists;
- latest consensus-bound decision, violated rule, fault class, consequence rule, summary, and verdict digest;
- deterministic Vault status, principal, and provider bond;
- explicit labeling that Vault status is a latest live EVM read while GenLayer records use the selected accepted/finalized variant;
- six-way Registry / Adjudicator / Vault topology verification;
- finalized versus accepted/provisional snapshot state;
- explicit statements separating byte integrity, authority, and settlement finality.

## Safety boundary

The feature is read-only. It does not add a new economic authority, alter the deployed Intelligent Contracts, change the Vault, or infer legal truth from a URL or hash. The Proof Pack is a transparent rendering/export of contract state and preserves VerdictGraph’s existing rule that accepted state is not final state.

## Release acceptance checklist

- [x] Public route exists at `/cases/[id]/proof`.
- [x] Wallet is not required to read or share a Proof Pack.
- [x] Case detail links to the new route.
- [x] JSON export includes a schema identifier and canonical pack digest.
- [x] Share uses the Web Share API when available and falls back to copying the URL.
- [x] Print output hides app chrome and action controls.
- [x] Failed topology verification is visible rather than silently treated as verified.
- [x] Latest live Vault reads are distinguished from the selected GenLayer state variant.
- [x] Provisional snapshots are visibly labelled and warned.
- [x] Milestone proof packs distinguish finalized chain state from reviewed protocol state.
- [x] Milestone authority records include pinned baseline/acceptance mirrors and a submission-origin allowlist.
- [x] Milestone live Vault reads include an EVM block number/hash anchor.
- [x] No contract source or deployed address is changed by this release slice.
- [ ] Deploy the frontend and re-check the public Proof Pack route against a live case before external submission.
