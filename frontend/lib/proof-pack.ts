import {
  BRADBURY_CHAIN_ID,
  BRADBURY_EXPLORER,
  VERDICTGRAPH_ADJUDICATOR_ADDRESS,
  VERDICTGRAPH_REGISTRY_ADDRESS,
  VERDICTGRAPH_VAULT_ADDRESS,
} from "@/lib/genlayer/client";
import { asNumber } from "@/lib/format";
import type { CaseData, ProtocolState } from "@/lib/case-data";

export const PROOF_PACK_SCHEMA = "verdictgraph.case-proof.v1";

export type VaultRead = {
  code: number;
  label: string;
};

export type VaultSnapshot = (VaultRead & {
  source: "latest-live-evm-read";
}) | null;

export type ProofPack = {
  schema: typeof PROOF_PACK_SCHEMA;
  network: {
    name: string;
    chain_id: number;
    explorer: string;
  };
  snapshot: {
    state: ProtocolState;
    finalized: boolean;
    case_id: string;
    revision: string;
  };
  contracts: {
    registry: string;
    adjudicator: string;
    vault: string;
  };
  workflow: {
    id: string;
    title: string;
    mission: string;
    owner: string;
    policy_id: string;
    status: string;
    deadline: string;
  };
  handoff: {
    id: string;
    responsibility: string;
    requester: string;
    provider: string;
    delivery: {
      version: string;
      uri: string;
      sha256: string;
      submitted_at: string;
      accepted_at: string;
    };
    terms: {
      principal_required: string;
      provider_bond_required: string;
      funding_deadline: string;
      deadline: string;
      recovery_deadline: string;
    };
  };
  policy: {
    id: string;
    title: string;
    version: string;
    sealed: boolean;
    fingerprint_sha256: string;
    minimum_distinct_issuers: string;
    minimum_distinct_publishers: string;
    max_evidence_age_seconds: string;
    minimum_remaining_validity_seconds: string;
  };
  case: {
    id: string;
    claim: string;
    status: string;
    opener: string;
    created_at: string;
    response_deadline: string;
    recovery_deadline: string;
    settlement_earliest_at: string;
    settlement_queued: boolean;
    vault_terminal_status: string;
  };
  revision: {
    number: string;
    status: string;
    response_author: string;
    response_uri: string;
    response_sha256: string;
    evidence_count: string;
    distinct_issuer_count: string;
    distinct_publisher_count: string;
    corroboration_group: string;
    failure_code: string;
  };
  evidence: Array<{
    id: string;
    stable_record_id: string;
    version: string;
    issuer: string;
    publisher_prefix: string;
    source_uri: string;
    expected_sha256: string;
    issued_at: string;
    observed_at: string;
    expires_at: string;
    corroboration_group: string;
    registered_at: string;
  }>;
  verdict: {
    id: string;
    decision: string;
    violated_rule_id: string;
    fault_class: string;
    consequence_rule_id: string;
    consequence: string;
    source_set_sha256: string;
    summary: string;
    verdict_sha256: string;
    resolved_at: string;
  } | null;
  vault: VaultSnapshot;
  verification: {
    sealed_policy: boolean;
    issuer_threshold_met: boolean;
    publisher_threshold_met: boolean;
    verdict_present: boolean;
    topology_verified: boolean;
    finality_safe: boolean;
  };
  interpretation: {
    hash_proves: string;
    authority_comes_from: string;
    settlement_boundary: string;
  };
};

const consequenceLabels: Record<number, string> = {
  1: "Release provider: principal + provider bond",
  2: "Provider breach: requester receives principal + provider bond",
  3: "Neutral recovery: requester receives principal; provider bond returned",
};

export function consequenceLabel(ruleId: unknown): string {
  return consequenceLabels[asNumber(ruleId)] ?? "Unknown registered consequence";
}

export function buildProofPack(
  caseId: number,
  data: CaseData,
  state: ProtocolState,
  vault: VaultRead | null,
  topologyVerified: boolean,
): ProofPack {
  const { caseRecord, workflow, policy, handoff, revision, evidence, verdict } = data;
  const issuerThresholdMet =
    asNumber(revision.distinct_issuer_count) >=
    asNumber(policy.minimum_distinct_issuers);
  const publisherThresholdMet =
    asNumber(revision.distinct_publisher_count) >=
    asNumber(policy.minimum_distinct_publishers);

  return {
    schema: PROOF_PACK_SCHEMA,
    network: {
      name: "GenLayer Bradbury",
      chain_id: BRADBURY_CHAIN_ID,
      explorer: BRADBURY_EXPLORER,
    },
    snapshot: {
      state,
      finalized: state === "finalized",
      case_id: String(caseId),
      revision: String(asNumber(caseRecord.current_revision)),
    },
    contracts: {
      registry: VERDICTGRAPH_REGISTRY_ADDRESS,
      adjudicator: VERDICTGRAPH_ADJUDICATOR_ADDRESS,
      vault: VERDICTGRAPH_VAULT_ADDRESS,
    },
    workflow: {
      id: String(asNumber(caseRecord.workflow_id)),
      title: workflow.title,
      mission: workflow.mission,
      owner: workflow.owner,
      policy_id: String(asNumber(workflow.policy_id)),
      status: workflow.status,
      deadline: String(workflow.deadline),
    },
    handoff: {
      id: String(asNumber(caseRecord.handoff_id)),
      responsibility: handoff.responsibility,
      requester: handoff.requester,
      provider: handoff.provider,
      delivery: {
        version: String(handoff.delivery_version),
        uri: handoff.delivery_uri,
        sha256: handoff.delivery_sha256,
        submitted_at: String(handoff.delivery_submitted_at),
        accepted_at: String(handoff.delivery_accepted_at),
      },
      terms: {
        principal_required: String(handoff.principal_required),
        provider_bond_required: String(handoff.provider_bond_required),
        funding_deadline: String(handoff.funding_deadline),
        deadline: String(handoff.deadline),
        recovery_deadline: String(handoff.recovery_deadline),
      },
    },
    policy: {
      id: String(asNumber(workflow.policy_id)),
      title: policy.title,
      version: String(policy.version),
      sealed: policy.sealed,
      fingerprint_sha256: policy.fingerprint_sha256,
      minimum_distinct_issuers: String(policy.minimum_distinct_issuers),
      minimum_distinct_publishers: String(policy.minimum_distinct_publishers),
      max_evidence_age_seconds: String(policy.max_evidence_age_seconds),
      minimum_remaining_validity_seconds: String(policy.minimum_remaining_validity_seconds),
    },
    case: {
      id: String(caseId),
      claim: caseRecord.claim,
      status: caseRecord.status,
      opener: caseRecord.opener,
      created_at: caseRecord.created_at,
      response_deadline: String(caseRecord.response_deadline),
      recovery_deadline: String(caseRecord.recovery_deadline),
      settlement_earliest_at: String(caseRecord.settlement_earliest_at),
      settlement_queued: caseRecord.settlement_queued,
      vault_terminal_status: String(caseRecord.vault_terminal_status),
    },
    revision: {
      number: String(revision.revision_no),
      status: revision.status,
      response_author: revision.response_author,
      response_uri: revision.response_uri,
      response_sha256: revision.response_sha256,
      evidence_count: String(revision.evidence_count),
      distinct_issuer_count: String(revision.distinct_issuer_count),
      distinct_publisher_count: String(revision.distinct_publisher_count),
      corroboration_group: revision.corroboration_group,
      failure_code: revision.failure_code,
    },
    evidence: evidence.map(({ id, value }) => ({
      id: String(id),
      stable_record_id: value.stable_record_id,
      version: String(value.version),
      issuer: value.issuer,
      publisher_prefix: value.publisher_prefix,
      source_uri: value.source_uri,
      expected_sha256: value.expected_sha256,
      issued_at: String(value.issued_at),
      observed_at: String(value.observed_at),
      expires_at: String(value.expires_at),
      corroboration_group: value.corroboration_group,
      registered_at: value.registered_at,
    })),
    verdict: verdict
      ? {
          id: String(asNumber(caseRecord.latest_verdict_id)),
          decision: verdict.decision,
          violated_rule_id: String(verdict.violated_rule_id),
          fault_class: verdict.fault_class,
          consequence_rule_id: String(verdict.consequence_rule_id),
          consequence: consequenceLabel(verdict.consequence_rule_id),
          source_set_sha256: verdict.source_set_sha256,
          summary: verdict.summary,
          verdict_sha256: verdict.verdict_sha256,
          resolved_at: verdict.resolved_at,
        }
      : null,
    vault: vault ? { ...vault, source: "latest-live-evm-read" } : null,
    verification: {
      sealed_policy: policy.sealed,
      issuer_threshold_met: issuerThresholdMet,
      publisher_threshold_met: publisherThresholdMet,
      verdict_present: Boolean(verdict),
      topology_verified: topologyVerified,
      finality_safe: state === "finalized",
    },
    interpretation: {
      hash_proves: "The fetched bytes match the registered SHA-256 digest.",
      authority_comes_from: "The sealed policy's approved issuer address and publisher boundary.",
      settlement_boundary: "The deterministic Vault can apply consequences only through finality-only messages.",
    },
  };
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(sortJson(value));
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
