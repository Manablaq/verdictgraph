# Milestone Bradbury deployment runbook

This runbook is the publication boundary for the split milestone release. It
deploys four new contracts in a dependency-safe order: the Authority IC, the
Registry IC, the Adjudicator IC, and the deterministic EVM Vault. No existing
VerdictGraph production contract is reused as a milestone contract.

## 1. Verify the exact source package

From the repository root:

```bash
npm run verify
npm run milestone:verify
```

The milestone gate must pass completely. Do not deploy if the source manifest,
GenVM validation, isolated Direct Mode suites, Foundry, TypeScript, or the
production build gate fails.

`scripts/build_milestone_deploy_artifact.py` generates the three Bradbury
transport artifacts and proves reversible executable-AST plus public/storage
surface parity against their canonical sources. The constructor-bound digest
for each deployment is the exact generated artifact SHA-256, not an untracked
or manually edited value.

The CLI treats a `0x` constructor token as a typed address. These IC
constructors intentionally accept a string that is converted to `Address` by
the contract, so deployment commands must pass each 20-byte address as its
base64 representation (which the CLI transports as a string). Record both the
human-readable address and the exact constructor token used.

## 2. Run the no-send Bradbury preflight

Use the intended deployer and acceptance authority addresses. This command
does not read a private key, request a signature, or submit a transaction. It
checks every IC artifact through the SDK's Bradbury path and checks the Vault
creation/runtime package locally.

```bash
VERDICTGRAPH_DEPLOYER=0x... \
VERDICTGRAPH_MILESTONE_ACCEPTANCE_AUTHORITY=0x... \
VERDICTGRAPH_MILESTONE_PREFLIGHT_MODE=no-send \
scripts/milestone_bradbury_preflight.sh
```

Every IC probe must complete its provider-blocked no-send path. A Bradbury
estimate rejection is a deployment blocker; never force a lower gas limit or
send raw calldata around it.

## 3. Deploy the Authority IC

Deploy exactly:

```text
contracts/verdict_graph_milestone_authority_deploy.py
```

Constructor arguments, in order:

```text
[
  <acceptanceAuthorityAddress>,
  <authorityDeploymentArtifactSha256>
]
```

The deployer becomes the Authority owner. The acceptance authority is the
funded address that can register accepted project trust roots. Record the
finalized deployment transaction and address before continuing.

## 4. Deploy the Registry IC

Deploy exactly:

```text
contracts/verdict_graph_milestone_registry_deploy.py
```

Constructor arguments:

```text
[
  <authorityAddress>,
  <registryDeploymentArtifactSha256>
]
```

The Registry owns the milestone state machine, references the Authority by
finalized view, authenticates the Adjudicator callback, and is the sole future
Vault controller.

## 5. Deploy the Adjudicator IC

Deploy exactly:

```text
contracts/verdict_graph_milestone_adjudicator_deploy.py
```

Constructor arguments:

```text
[
  <registryAddress>,
  <adjudicatorDeploymentArtifactSha256>
]
```

The Adjudicator is intentionally limited to hash-pinned evidence retrieval,
validator-equivalence review, review receipts, and finalized callbacks to the
Registry.

## 6. Bind the Registry and deploy the Vault

From the Registry owner, submit and finalize:

```text
bind_adjudicator(<adjudicatorAddress>)
```

The Registry performs a reciprocal `registry_address()` check, so a wrong
Adjudicator cannot be bound. Then deploy the Vault with:

```text
contracts/VerdictGraphMilestoneVault.sol

constructor(<registryAddress>)
```

The Vault's immutable controller is the Registry. Its `milestone_core()`
getter is retained only as an ABI compatibility alias for older tooling; the
actual immutable storage and authorization are Registry-named.

Finally, from the Registry owner, submit and finalize:

```text
bind_vault(<vaultAddress>)
```

## 7. Verify finalized reciprocal identity before publication

Read the finalized state and compiled runtime. All of these must pass:

- Authority `get_acceptance_authority()` equals the funded acceptance authority;
- Registry `get_authority_address()` equals the deployed Authority;
- Registry `get_adjudicator_address()` equals the deployed Adjudicator;
- Registry `get_vault_address()` equals the deployed Vault;
- Adjudicator `registry_address()` equals the deployed Registry;
- Vault `milestoneRegistry()` and compatibility `milestone_core()` equal the Registry;
- each IC source getter equals its exact generated deployment-artifact digest;
- Vault runtime SHA-256 equals `expectedVaultRuntimeSha256` after replacing all
  four compiler immutable placeholders with the actual Registry address;
  `scripts/milestone_vault_runtime_hash.py` performs this check;
- Authority project registration is write-once and only acceptance-authority gated;
- Registry review callbacks reject unauthorized/stale/malformed receipts;
- Adjudicator retries emit the cached exact result for the same request;
- duplicate Vault registration is harmless for identical terms and rejects changed terms;
- late finalized outcomes cannot settle an expired escrow;
- the public Proof Pack reports the split topology and block-anchored Vault read.

Record every finalized transaction, address, digest, git commit, and verification
timestamp in `deploy/milestone-bradbury.template.json`. Change
`deploymentStatus` only after all evidence exists.

### GenLayer CLI finalizer gas compatibility

With GenLayer CLI 0.39.2 on Bradbury, `genlayer finalize` can fall back to a
200,000 gas limit when `eth_estimateGas` rejects the finalizer call. If that
official finalizer transaction reverts, verify that the transaction is still
status `5` (`ACCEPTED`) and retry the same `ConsensusMain.finalizeTransaction`
operation with a measured 2,000,000 gas limit through the configured worker.
This is the protocol finalizer itself, not a state or consensus bypass. Record
both outer EVM transaction hashes and require GenLayer status `7` before any
binding is submitted. The known estimator behavior is tracked at
[`genlayer-cli#402`](https://github.com/genlayerlabs/genlayer-cli/issues/402).

## 8. Enable the public UI

Populate production environment variables with the finalized values:

```text
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_AUTHORITY_ADDRESS=<Authority>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS=<Registry>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_ADJUDICATOR_ADDRESS=<Adjudicator>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_VAULT_ADDRESS=<Vault>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_AUTHORITY_SOURCE_SHA256=<Authority artifact SHA-256>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_REGISTRY_SOURCE_SHA256=<Registry artifact SHA-256>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_ADJUDICATOR_SOURCE_SHA256=<Adjudicator artifact SHA-256>
NEXT_PUBLIC_VERDICTGRAPH_MILESTONE_VAULT_RUNTIME_SHA256=<compiled runtime SHA-256>
```

Rebuild the frontend and open `/milestones`, `/milestones/authority`, a real
milestone detail page, and `/milestones/:id/proof`. The UI must remain disabled
if any address, source digest, runtime digest, or reciprocal finalized read is
missing or mismatched.
