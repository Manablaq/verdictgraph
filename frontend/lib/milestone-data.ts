import { readMilestone, readMilestoneAuthority } from "@/lib/genlayer/client";
import { asNumber } from "@/lib/format";
import type { AcceptedProjectRecord, MilestoneChallengeRecord, MilestoneRecord, MilestoneReviewRecord, MilestoneSubmissionRecord } from "@/lib/types";

export type MilestoneData = {
  value: MilestoneRecord;
  submission: MilestoneSubmissionRecord | null;
  review: MilestoneReviewRecord | null;
  acceptedProject: AcceptedProjectRecord;
  acceptanceAuthority: string;
  challenges: MilestoneChallengeRecord[];
};

export async function loadMilestoneData(id: number): Promise<MilestoneData> {
  const value = await readMilestone<MilestoneRecord>("get_milestone", [BigInt(id)]);
  const [submission, review, acceptedProject, acceptanceAuthority, challenges] = await Promise.all([
    asNumber(value.submission_version) > 0 ? readMilestone<MilestoneSubmissionRecord>("get_submission", [BigInt(id), value.submission_version]) : Promise.resolve(null),
    asNumber(value.latest_review_id) > 0 ? readMilestone<MilestoneReviewRecord>("get_review", [value.latest_review_id]) : Promise.resolve(null),
    readMilestoneAuthority<AcceptedProjectRecord>("get_accepted_project", [value.project_ref]),
    readMilestoneAuthority<string>("get_acceptance_authority"),
    Promise.all(
      Array.from({ length: Number(value.challenge_count) }, (_, index) =>
        readMilestone<MilestoneChallengeRecord>("get_challenge", [BigInt(id), BigInt(index + 1)]),
      ),
    ),
  ]);
  if (!acceptedProject || !acceptanceAuthority) throw new Error("Milestone acceptance provenance is unavailable");
  return { value, submission, review, acceptedProject, acceptanceAuthority, challenges };
}
