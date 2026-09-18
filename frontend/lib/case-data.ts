import {
  readAdjudicator,
  readRegistry,
} from "@/lib/genlayer/client";
import { asNumber } from "@/lib/format";
import type {
  CaseRecord,
  EvidencePolicyRecord,
  EvidenceRecord,
  HandoffRecord,
  RevisionRecord,
  VerdictRecord,
  WorkflowRecord,
} from "@/lib/types";

export type ProtocolState = "accepted" | "finalized";

export type CaseEvidence = {
  id: number;
  value: EvidenceRecord;
};

export type CaseData = {
  caseRecord: CaseRecord;
  workflow: WorkflowRecord;
  policy: EvidencePolicyRecord;
  handoff: HandoffRecord;
  revision: RevisionRecord;
  evidence: CaseEvidence[];
  verdict: VerdictRecord | null;
};

/**
 * Read the complete case snapshot used by both the operational case view and
 * the publication-oriented Proof Pack. Keeping this in one loader prevents
 * the two surfaces from drifting into different interpretations of state.
 */
export async function loadCase(
  id: number,
  stateStatus: ProtocolState = "finalized",
): Promise<CaseData> {
  const caseRecord = await readAdjudicator<CaseRecord>(
    "get_case",
    [BigInt(id)],
    stateStatus,
  );
  const workflow = await readRegistry<WorkflowRecord>(
    "get_workflow",
    [caseRecord.workflow_id],
    stateStatus,
  );
  const [policy, handoff, revision] = await Promise.all([
    readRegistry<EvidencePolicyRecord>(
      "get_policy",
      [workflow.policy_id],
      stateStatus,
    ),
    readRegistry<HandoffRecord>(
      "get_handoff",
      [caseRecord.handoff_id],
      stateStatus,
    ),
    readAdjudicator<RevisionRecord>(
      "get_revision",
      [BigInt(id), caseRecord.current_revision],
      stateStatus,
    ),
  ]);

  const evidence = await Promise.all(
    Array.from(
      { length: asNumber(revision.evidence_count) },
      async (_, index) => {
        const evidenceId = asNumber(
          await readAdjudicator<bigint>(
            "get_revision_evidence_id",
            [
              BigInt(id),
              caseRecord.current_revision,
              BigInt(index),
            ],
            stateStatus,
          ),
        );

        return {
          id: evidenceId,
          value: await readAdjudicator<EvidenceRecord>(
            "get_evidence",
            [BigInt(evidenceId)],
            stateStatus,
          ),
        };
      },
    ),
  );

  const verdict = asNumber(caseRecord.latest_verdict_id) > 0
    ? await readAdjudicator<VerdictRecord>(
        "get_verdict",
        [caseRecord.latest_verdict_id],
        stateStatus,
      )
    : null;

  return {
    caseRecord,
    workflow,
    policy,
    handoff,
    revision,
    evidence,
    verdict,
  };
}
