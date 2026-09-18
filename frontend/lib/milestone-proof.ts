import { BRADBURY_CHAIN_ID, BRADBURY_EXPLORER, getMilestoneAdjudicatorAddress, getMilestoneAdjudicatorSourceSha256, getMilestoneAuthorityAddress, getMilestoneAuthoritySourceSha256, getMilestoneRegistryAddress, getMilestoneRegistrySourceSha256, getMilestoneVaultRuntimeSha256 } from "@/lib/genlayer/client";
import { asNumber } from "@/lib/format";
import type { MilestoneData } from "@/lib/milestone-data";
import type { MilestoneVaultSnapshot } from "@/lib/genlayer/milestone-vault";

export const MILESTONE_PROOF_SCHEMA = "verdictgraph.milestone-proof.v5";

type MilestoneVaultLiveRead = MilestoneVaultSnapshot & { source: "latest-live-evm-read" };
export type MilestoneVaultRead = MilestoneVaultLiveRead | null;

type MilestoneVaultProofEscrow = {
  owner: string;
  beneficiary: string;
  principal_required: string;
  beneficiary_bond_required: string;
  funding_deadline: string;
  recovery_deadline: string;
  terms_sha256: string;
  status: number;
};

export type MilestoneProofPack = {
  schema: typeof MILESTONE_PROOF_SCHEMA;
  network: { name: string; chain_id: number; explorer: string };
  snapshot: { chain_state: "finalized"; protocol_state: "reviewed" | "provisional"; protocol_finalized: boolean; milestone_id: string };
  contracts: { milestone_authority: string; milestone_registry: string; milestone_adjudicator: string; milestone_vault: string | null; milestone_authority_source_sha256: string; milestone_registry_source_sha256: string; milestone_adjudicator_source_sha256: string; milestone_vault_runtime_sha256: string };
  acceptance: { authority: string; project_ref: string; sponsor: string; baseline_uri: string; baseline_sha256: string; baseline_mirror_uri: string; acceptance_record_uri: string; acceptance_record_sha256: string; acceptance_record_mirror_uri: string; submission_origins_json: string; registered_at: string };
  baseline: { uri: string; sha256: string; terms_sha256: string };
  milestone: {
    id: string;
    reference: string;
    project_ref: string;
    title: string;
    objective: string;
    owner: string;
    beneficiary: string;
    criteria: unknown;
    principal_required: string;
    beneficiary_bond_required: string;
    funding_deadline: string;
    submission_deadline: string;
    recovery_deadline: string;
    challenge_window_seconds: string;
    status: string;
    challenge_count: string;
    settlement_queued: boolean;
    settlement_attempt_count: string;
    repair_failure_code: string;
  };
  submission: { version: string; uri: string; sha256: string; submitted_by: string; submitted_at: string } | null;
  challenges: Array<{ number: string; reason: string; challenged_by: string; challenged_at: string; resolved_review_id: string }>;
  review: { id: string; submission_version: string; challenge_count: string; decision: string; failed_criterion_id: string; consequence_rule_id: string; source_set_sha256: string; summary: string; review_sha256: string; resolved_at: string } | null;
  vault: { code: number; label: string; source: "latest-live-evm-read"; block_number: string; block_hash: string; escrow: MilestoneVaultProofEscrow } | null;
  verification: { acceptance_authority_registered: boolean; baseline_hash_pinned: boolean; submission_hash_pinned: boolean; validator_review_present: boolean; topology_verified: boolean; finality_safe: boolean; authority_source_pinned: boolean; registry_source_pinned: boolean; adjudicator_source_pinned: boolean; vault_runtime_pinned: boolean; vault_terms_match: boolean; settlement_boundary: boolean; evm_block_anchored: boolean };
  interpretation: { hash_proves: string; decision_proves: string; settlement_proves: string };
};

export function buildMilestoneProofPack(id: number, data: MilestoneData, vault: MilestoneVaultRead, topologyVerified: boolean, vaultAddress: string | null): MilestoneProofPack {
  const value = data.value;
  let criteria: unknown = [];
  try { criteria = JSON.parse(value.criteria_json); } catch { criteria = value.criteria_json; }
  const authoritySourceSha256 = getMilestoneAuthoritySourceSha256() ?? "";
  const registrySourceSha256 = getMilestoneRegistrySourceSha256() ?? "";
  const adjudicatorSourceSha256 = getMilestoneAdjudicatorSourceSha256() ?? "";
  const vaultRuntimeSha256 = getMilestoneVaultRuntimeSha256() ?? "";
  const currentReview = data.review && value.status === "REVIEWED" && String(data.review.submission_version) === String(value.submission_version) && String(data.review.challenge_count) === String(value.challenge_count) ? data.review : null;
  const vaultTermsMatch = Boolean(vault && vault.escrow.owner.toLowerCase() === value.owner.toLowerCase() && vault.escrow.beneficiary.toLowerCase() === value.beneficiary.toLowerCase() && vault.escrow.principalRequired === BigInt(value.principal_required) && vault.escrow.beneficiaryBondRequired === BigInt(value.beneficiary_bond_required) && vault.escrow.fundingDeadline === BigInt(value.funding_deadline) && vault.escrow.recoveryDeadline === BigInt(value.recovery_deadline) && vault.escrow.termsSha256 === value.terms_sha256);
  return {
    schema: MILESTONE_PROOF_SCHEMA,
    network: { name: "GenLayer Bradbury", chain_id: BRADBURY_CHAIN_ID, explorer: BRADBURY_EXPLORER },
    snapshot: { chain_state: "finalized", protocol_state: currentReview ? "reviewed" : "provisional", protocol_finalized: Boolean(currentReview), milestone_id: String(id) },
    contracts: { milestone_authority: getMilestoneAuthorityAddress() ?? "", milestone_registry: getMilestoneRegistryAddress() ?? "", milestone_adjudicator: getMilestoneAdjudicatorAddress() ?? "", milestone_vault: topologyVerified ? vaultAddress : null, milestone_authority_source_sha256: authoritySourceSha256, milestone_registry_source_sha256: registrySourceSha256, milestone_adjudicator_source_sha256: adjudicatorSourceSha256, milestone_vault_runtime_sha256: vaultRuntimeSha256 },
    acceptance: { authority: data.acceptanceAuthority, project_ref: data.acceptedProject.project_ref, sponsor: data.acceptedProject.sponsor, baseline_uri: data.acceptedProject.baseline_uri, baseline_sha256: data.acceptedProject.baseline_sha256, baseline_mirror_uri: data.acceptedProject.baseline_mirror_uri, acceptance_record_uri: data.acceptedProject.acceptance_record_uri, acceptance_record_sha256: data.acceptedProject.acceptance_record_sha256, acceptance_record_mirror_uri: data.acceptedProject.acceptance_record_mirror_uri, submission_origins_json: data.acceptedProject.submission_origins_json, registered_at: data.acceptedProject.registered_at },
    baseline: { uri: value.baseline_uri, sha256: value.baseline_sha256, terms_sha256: value.terms_sha256 },
    milestone: { id: String(id), reference: value.reference, project_ref: value.project_ref, title: value.title, objective: value.objective, owner: value.owner, beneficiary: value.beneficiary, criteria, principal_required: String(value.principal_required), beneficiary_bond_required: String(value.beneficiary_bond_required), funding_deadline: String(value.funding_deadline), submission_deadline: String(value.submission_deadline), recovery_deadline: String(value.recovery_deadline), challenge_window_seconds: String(value.challenge_window_seconds), status: value.status, challenge_count: String(value.challenge_count), settlement_queued: value.settlement_queued, settlement_attempt_count: String(value.settlement_attempt_count), repair_failure_code: value.repair_failure_code },
    submission: data.submission ? { version: String(data.submission.version), uri: data.submission.uri, sha256: data.submission.sha256, submitted_by: data.submission.submitted_by, submitted_at: String(data.submission.submitted_at) } : null,
    challenges: data.challenges.map((challenge) => ({ number: String(challenge.challenge_number), reason: challenge.reason, challenged_by: challenge.challenged_by, challenged_at: String(challenge.challenged_at), resolved_review_id: String(challenge.resolved_review_id) })),
    review: currentReview ? { id: String(value.latest_review_id), submission_version: String(currentReview.submission_version), challenge_count: String(currentReview.challenge_count), decision: currentReview.decision, failed_criterion_id: String(currentReview.failed_criterion_id), consequence_rule_id: String(currentReview.consequence_rule_id), source_set_sha256: currentReview.source_set_sha256, summary: currentReview.summary, review_sha256: currentReview.review_sha256, resolved_at: currentReview.resolved_at } : null,
    vault: vault ? { code: vault.code, label: vault.label, source: vault.source, block_number: String(vault.blockNumber), block_hash: vault.blockHash, escrow: { owner: vault.escrow.owner, beneficiary: vault.escrow.beneficiary, principal_required: String(vault.escrow.principalRequired), beneficiary_bond_required: String(vault.escrow.beneficiaryBondRequired), funding_deadline: String(vault.escrow.fundingDeadline), recovery_deadline: String(vault.escrow.recoveryDeadline), terms_sha256: vault.escrow.termsSha256, status: vault.escrow.status } } : null,
    verification: { acceptance_authority_registered: Boolean(data.acceptanceAuthority && data.acceptedProject.project_ref === value.project_ref && data.acceptedProject.sponsor.toLowerCase() === value.owner.toLowerCase() && data.acceptedProject.baseline_sha256 === value.baseline_sha256), baseline_hash_pinned: /^([0-9a-f]{64})$/.test(value.baseline_sha256), submission_hash_pinned: Boolean(data.submission && /^[0-9a-f]{64}$/.test(data.submission.sha256)), validator_review_present: Boolean(currentReview), topology_verified: topologyVerified, finality_safe: true, authority_source_pinned: Boolean(authoritySourceSha256), registry_source_pinned: Boolean(registrySourceSha256), adjudicator_source_pinned: Boolean(adjudicatorSourceSha256), vault_runtime_pinned: Boolean(vaultRuntimeSha256), vault_terms_match: vaultTermsMatch, settlement_boundary: Boolean(vault && vaultTermsMatch), evm_block_anchored: Boolean(vault?.blockHash) },
    interpretation: { hash_proves: "The retrieved baseline and submission bytes can be checked against their registered SHA-256 digests.", decision_proves: "The displayed decision is the latest finalized GenLayer validator consensus for this submission revision; a provisional pack is still a finalized chain read and has no validator review yet.", settlement_proves: "The deterministic Vault can act only on the exact final consequence selected by the controller; this pack includes its live escrow terms and the EVM block hash anchoring that latest read." },
  };
}

export function consequenceLabel(ruleId: unknown) {
  return ({ 1: "PASS: beneficiary receives principal + bond", 2: "FAIL: owner receives principal + bond", 3: "UNDETERMINED: owner receives principal; beneficiary bond returned" } as Record<number, string>)[asNumber(ruleId)] ?? "Unknown consequence";
}
