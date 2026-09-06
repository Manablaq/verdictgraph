# VerdictGraph trust model

## What the protocol proves

### Transport
An HTTPS/IPFS/gateway URL is only a way to retrieve bytes. It is not authority.

### Integrity
`expected_sha256` binds the exact fetched bytes. It does not prove who authored those bytes.

### Provenance
An evidence record can only be registered by an address explicitly approved in the sealed `EvidencePolicy`. The GenLayer transaction signature authenticates control of that address. The policy owner is responsible for deciding which real-world issuer identity that address represents.

### Publisher boundary
The policy also binds approved HTTPS publisher prefixes. VerdictGraph requires slash-terminated publisher boundaries to avoid ambiguous prefix matching.

### Freshness
Evidence stores `issued_at`, `observed_at`, and `expires_at`. Freshness and remaining validity are checked both at registration and immediately before review.

### Corroboration
V1 refuses a policy threshold below two distinct issuer addresses and two distinct publisher boundaries. Evidence in one revision must:

- come from distinct approved issuer addresses to count as distinct issuers;
- come from distinct approved publisher prefixes to count as distinct publishers;
- use distinct stable evidence IDs;
- use distinct content digests;
- share one explicit `corroboration_group` identifying the fact being corroborated.

This prevents two identical copies of the same bytes from satisfying corroboration merely because they were registered twice.

### Immutability/versioning
Evidence binds a stable record ID, explicit version, source reference and complete byte digest. Ordinary stable-ID reuse is prohibited. If the exact record is the persisted failed evidence in a `REPAIR_REQUIRED` revision, the same authenticated issuer may submit the same stable ID only at a strictly higher version for the same case/handoff. This preserves identity across repair without allowing arbitrary replay.

## Trust assumptions that remain explicit

- The policy owner chooses approved issuer addresses and publisher boundaries.
- The chain authenticates addresses but cannot prove that two addresses or publishers are economically/organizationally independent real-world entities.
- A content hash proves byte equality, not truth.
- A versioned reference can make evidence stable, but stability does not make the publisher authoritative.
- GenLayer consensus reduces dependence on a single model/validator; it does not turn weak evidence authorities into strong ones.

Reviewer demos must therefore document the real-world identity and independence rationale for every authority configured into the sealed policy.

## Party responses

A response/counter-evidence narrative does not become authoritative evidence simply because a participant submitted it. Its provenance is the participant address, its bytes are hash-bound, and validators fetch it as explicitly delimited **untrusted party content**. It can explain or rebut facts but cannot override the sealed evidence policy or registered criteria.

A new post-review response creates a new immutable revision and invalidates the previous verdict as the *current* verdict for future settlement.

## Repairability

Fetch, hash, UTF-8, size, stale/expiry and response-integrity failures are represented as `REPAIR_REQUIRED` rather than silently becoming a substantive verdict. The failing evidence ID, failure code and observed digest (where available) are persisted. A repair revision automatically carries forward unaffected corroborators and permits only the failed stable record to return as a higher version from the same issuer. Transient fetch failures can retry the same revision without inventing a replacement record.

## Consequence boundary

The semantic layer cannot output money or percentages. It selects one exact registered criterion/consequence rule. The EVM Vault performs fixed arithmetic only after a finality-only settlement message.
