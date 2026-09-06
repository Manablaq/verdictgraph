export type EvidencePolicyRecord = {
  owner: string;
  title: string;
  version: bigint;
  max_evidence_age_seconds: bigint;
  minimum_remaining_validity_seconds: bigint;
  minimum_distinct_issuers: bigint;
  minimum_distinct_publishers: bigint;
  response_window_seconds: bigint;
  repair_window_seconds: bigint;
  review_recovery_seconds: bigint;
  issuer_count: bigint;
  publisher_count: bigint;
  sealed: boolean;
  fingerprint_sha256: string;
  created_at: string;
};

export type WorkflowRecord = {
  owner: string;
  title: string;
  mission: string;
  policy_id: bigint;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  handoff_count: bigint;
  deadline: bigint;
  created_at: string;
};

export type HandoffRecord = {
  workflow_id: bigint;
  ordinal: bigint;
  requester: string;
  provider: string;
  responsibility: string;
  criteria_json: string;
  principal_required: bigint;
  provider_bond_required: bigint;
  funding_deadline: bigint;
  deadline: bigint;
  recovery_deadline: bigint;
  dependency_count: bigint;
  delivery_version: bigint;
  delivery_uri: string;
  delivery_sha256: string;
  delivery_submitted_at: bigint;
  delivery_accepted_at: bigint;
  completion_queued: boolean;
  completion_attempt_count: bigint;
  completion_last_attempt_at: bigint;
  vault_terminal_status: bigint;
  active: boolean;
};


export type DeliveryRecord = {
  handoff_id: bigint;
  version: bigint;
  provider: string;
  delivery_uri: string;
  delivery_sha256: string;
  submitted_at: bigint;
  created_at: string;
};

export type CaseRecord = {
  workflow_id: bigint;
  handoff_id: bigint;
  opener: string;
  claim: string;
  status: "OPEN" | "REVIEWED" | "REPAIR_REQUIRED" | "RECOVERED" | "SETTLED";
  current_revision: bigint;
  response_deadline: bigint;
  repair_deadline: bigint;
  recovery_deadline: bigint;
  settlement_earliest_at: bigint;
  settlement_queued: boolean;
  settlement_attempt_count: bigint;
  settlement_last_attempt_at: bigint;
  vault_terminal_status: bigint;
  latest_verdict_id: bigint;
  created_at: string;
};

export type RevisionRecord = {
  case_id: bigint;
  revision_no: bigint;
  response_author: string;
  response_uri: string;
  response_sha256: string;
  evidence_count: bigint;
  distinct_issuer_count: bigint;
  distinct_publisher_count: bigint;
  corroboration_group: string;
  failure_code: string;
  failed_evidence_id: bigint;
  observed_failure_sha256: string;
  requester_ready: boolean;
  provider_ready: boolean;
  status: "OPEN" | "REVIEWED" | "REPAIR_REQUIRED";
  created_at: string;
};

export type EvidenceRecord = {
  case_id: bigint;
  revision_no: bigint;
  handoff_id: bigint;
  stable_record_id: string;
  issuer: string;
  publisher_prefix: string;
  source_uri: string;
  expected_sha256: string;
  version: bigint;
  issued_at: bigint;
  observed_at: bigint;
  expires_at: bigint;
  corroboration_group: string;
  registered_at: string;
};

export type VerdictRecord = {
  case_id: bigint;
  revision_no: bigint;
  workflow_id: bigint;
  handoff_id: bigint;
  policy_id: bigint;
  policy_fingerprint_sha256: string;
  decision: "NO_BREACH" | "BREACH" | "UNDETERMINED";
  violated_rule_id: bigint;
  fault_class: string;
  consequence_rule_id: bigint;
  source_set_sha256: string;
  summary: string;
  verdict_sha256: string;
  resolved_at: string;
};
