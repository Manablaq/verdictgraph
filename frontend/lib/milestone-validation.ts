import { isAddress, parseEther } from "viem";

const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_FUNDING_WINDOW_SECONDS = 900;
// Bradbury finality can take roughly 30 minutes. Keep enough time for the
// finalized Registry callback to reach the EVM Vault before its deadline.
const MIN_FUNDING_FINALITY_BUFFER_SECONDS = 2 * 60 * 60;
const MIN_SUBMISSION_WINDOW_SECONDS = 900;
const MIN_RECOVERY_BUFFER_SECONDS = 900;
const MIN_CHALLENGE_WINDOW_SECONDS = 300;
const MAX_CHALLENGE_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const MAX_MILESTONE_HORIZON_SECONDS = 365 * 24 * 60 * 60;
const MAX_REVIEW_DOCUMENT_BYTES = 48_000;
const DOCUMENT_PREFLIGHT_TIMEOUT_MS = 15_000;

export type AcceptedProjectInput = {
  projectRef: string;
  sponsor: string;
  baselineUri: string;
  baselineSha: string;
  baselineMirrorUri: string;
  acceptanceRecordUri: string;
  acceptanceRecordSha: string;
  acceptanceRecordMirrorUri: string;
};

function isIpv4Literal(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => /^\d+$/.test(part) && Number(part) <= 255);
}

export function validateSha256(value: string, label: string): string | null {
  if (!SHA256_RE.test(value.trim())) return `${label} must be 64 lowercase hexadecimal characters.`;
  return null;
}

export function validateHttpsUri(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return `${label} must be a whitespace-free HTTPS URL.`;
  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !hostname || isIpv4Literal(hostname) || hostname === "localhost" || hostname.endsWith(".local")) {
      return `${label} must use a public HTTPS origin without credentials.`;
    }
    if (!hostname.includes(".") || hostname.split(".").some((part) => !part || part.startsWith("-") || part.endsWith("-") || !/^[a-z0-9-]+$/.test(part))) {
      return `${label} must use a public HTTPS origin.`;
    }
    if (parsed.port && parsed.port !== "443") return `${label} must use HTTPS on the default port.`;
    return null;
  } catch {
    return `${label} must be a valid HTTPS URL.`;
  }
}

export function validateAddress(value: string, label: string): string | null {
  return isAddress(value.trim()) ? null : `${label} must be a valid EVM address.`;
}

export function parsePositiveEther(value: string, label: string): { value: bigint; error: string | null } {
  try {
    const parsed = parseEther(value.trim());
    if (parsed <= 0n) return { value: 0n, error: `${label} must be greater than zero.` };
    return { value: parsed, error: null };
  } catch {
    return { value: 0n, error: `${label} must be a valid GEN amount.` };
  }
}

export function parseFutureUnix(value: string, label: string, nowSeconds: number): { value: bigint; error: string | null } {
  const milliseconds = new Date(value).getTime();
  const seconds = Math.floor(milliseconds / 1_000);
  if (!Number.isFinite(seconds) || seconds <= nowSeconds) return { value: 0n, error: `${label} must be in the future.` };
  return { value: BigInt(seconds), error: null };
}

export function parsePositiveInteger(value: string, label: string): { value: bigint; error: string | null } {
  if (!/^\d+$/.test(value.trim())) return { value: 0n, error: `${label} must be a positive whole number.` };
  try {
    const parsed = BigInt(value.trim());
    if (parsed <= 0n) return { value: 0n, error: `${label} must be greater than zero.` };
    return { value: parsed, error: null };
  } catch {
    return { value: 0n, error: `${label} is too large.` };
  }
}

export function validatePayoutTotal(principal: bigint, bond: bigint): string | null {
  return principal > MAX_UINT256 - bond ? "Principal plus bond exceeds the uint256 payout limit." : null;
}

export function validateMilestoneCreate(input: {
  title: string;
  objective: string;
  projectRef: string;
  criteria: string;
  beneficiary: string;
  principal: string;
  bond: string;
  fundingDeadline: string;
  submissionDeadline: string;
  recoveryDeadline: string;
  challengeWindow: string;
}, nowSeconds: number): string[] {
  const errors: string[] = [];
  if (!input.title.trim() || input.title.trim().length > 160) errors.push("Milestone title must be between 1 and 160 characters.");
  if (!input.objective.trim() || input.objective.trim().length > 4_000) errors.push("Objective must be between 1 and 4,000 characters.");
  if (!input.projectRef.trim() || input.projectRef.trim().length > 160) errors.push("Accepted project reference is required and must be at most 160 characters.");
  if (!input.criteria.trim() || input.criteria.trim().length > 1_200) errors.push("Success criterion must be between 1 and 1,200 characters.");
  const beneficiaryError = validateAddress(input.beneficiary, "Beneficiary address");
  if (beneficiaryError) errors.push(beneficiaryError);
  const principal = parsePositiveEther(input.principal, "Principal");
  const bond = parsePositiveEther(input.bond, "Beneficiary bond");
  if (principal.error) errors.push(principal.error);
  if (bond.error) errors.push(bond.error);
  if (!principal.error && !bond.error) {
    const payoutError = validatePayoutTotal(principal.value, bond.value);
    if (payoutError) errors.push(payoutError);
  }
  const funding = parseFutureUnix(input.fundingDeadline, "Funding deadline", nowSeconds);
  const submission = parseFutureUnix(input.submissionDeadline, "Submission deadline", nowSeconds);
  const recovery = parseFutureUnix(input.recoveryDeadline, "Recovery deadline", nowSeconds);
  if (funding.error) errors.push(funding.error);
  if (submission.error) errors.push(submission.error);
  if (recovery.error) errors.push(recovery.error);
  if (!funding.error && funding.value - BigInt(nowSeconds) < BigInt(MIN_FUNDING_WINDOW_SECONDS)) errors.push("Funding deadline must leave at least 15 minutes.");
  if (!funding.error && funding.value - BigInt(nowSeconds) < BigInt(MIN_FUNDING_FINALITY_BUFFER_SECONDS)) errors.push("Funding deadline must leave at least 2 hours so Bradbury finality can complete before escrow registration.");
  if (!funding.error && !submission.error && submission.value - funding.value < BigInt(MIN_SUBMISSION_WINDOW_SECONDS)) errors.push("Submission deadline must leave at least 15 minutes after funding.");
  if (!submission.error && !recovery.error && recovery.value - submission.value < BigInt(MIN_RECOVERY_BUFFER_SECONDS)) errors.push("Recovery deadline must leave at least 15 minutes after submission.");
  if (!recovery.error && recovery.value - BigInt(nowSeconds) > BigInt(MAX_MILESTONE_HORIZON_SECONDS)) errors.push("Recovery horizon cannot exceed 365 days.");
  if (!funding.error && !submission.error && submission.value <= funding.value) errors.push("Submission deadline must exceed funding deadline.");
  if (!submission.error && !recovery.error && recovery.value <= submission.value) errors.push("Recovery deadline must exceed submission deadline.");
  const challenge = parsePositiveInteger(input.challengeWindow, "Challenge window");
  if (challenge.error) errors.push(challenge.error);
  if (!challenge.error && (challenge.value < BigInt(MIN_CHALLENGE_WINDOW_SECONDS) || challenge.value > BigInt(MAX_CHALLENGE_WINDOW_SECONDS))) errors.push("Challenge window must be between 5 minutes and 30 days.");
  return errors;
}

export function validateAcceptedProject(input: AcceptedProjectInput): string[] {
  const errors: string[] = [];
  if (!input.projectRef.trim() || input.projectRef.trim().length > 160) errors.push("Project reference is required and must be at most 160 characters.");
  const sponsorError = validateAddress(input.sponsor, "Project sponsor address");
  if (sponsorError) errors.push(sponsorError);
  const baselineUriError = validateHttpsUri(input.baselineUri, "Accepted baseline URI");
  const baselineMirrorUriError = validateHttpsUri(input.baselineMirrorUri, "Accepted baseline mirror URI");
  const acceptanceUriError = validateHttpsUri(input.acceptanceRecordUri, "Acceptance record URI");
  const acceptanceMirrorUriError = validateHttpsUri(input.acceptanceRecordMirrorUri, "Acceptance record mirror URI");
  if (baselineUriError) errors.push(baselineUriError);
  if (baselineMirrorUriError) errors.push(baselineMirrorUriError);
  if (acceptanceUriError) errors.push(acceptanceUriError);
  if (acceptanceMirrorUriError) errors.push(acceptanceMirrorUriError);
  if (!baselineUriError && input.baselineUri.trim() === input.baselineMirrorUri.trim()) errors.push("Accepted baseline mirror must be a distinct URI.");
  if (!acceptanceUriError && input.acceptanceRecordUri.trim() === input.acceptanceRecordMirrorUri.trim()) errors.push("Acceptance record mirror must be a distinct URI.");
  const baselineHashError = validateSha256(input.baselineSha, "Baseline SHA-256");
  const acceptanceHashError = validateSha256(input.acceptanceRecordSha, "Acceptance record SHA-256");
  if (baselineHashError) errors.push(baselineHashError);
  if (acceptanceHashError) errors.push(acceptanceHashError);
  return errors;
}

async function fetchReviewDocument(uri: string, label: string, expectedSha256: string): Promise<{ bytes: Uint8Array | null; errors: string[] }> {
  const errors: string[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOCUMENT_PREFLIGHT_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(uri.trim(), {
        cache: "no-store",
        headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1" },
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      errors.push(`${label} could not be fetched${timedOut ? " within 15 seconds" : ""}. Check that the public HTTPS URL is live and allows browser reads.`);
      return { bytes: null, errors };
    }
    if (!response.ok) {
      errors.push(`${label} returned HTTP ${response.status}. It must be publicly reachable with a 2xx response.`);
      return { bytes: null, errors };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_REVIEW_DOCUMENT_BYTES) {
      errors.push(`${label} is ${bytes.byteLength.toLocaleString()} bytes; GenLayer review documents must be at most ${MAX_REVIEW_DOCUMENT_BYTES.toLocaleString()} bytes.`);
      return { bytes: null, errors };
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      errors.push(`${label} is not valid UTF-8 text. Do not use a binary archive such as .tar.gz as a review document.`);
      return { bytes: null, errors };
    }
    const digest = await sha256Bytes(bytes);
    if (digest !== expectedSha256.trim()) {
      errors.push(`${label} SHA-256 mismatch. Declared ${expectedSha256.trim()}, observed ${digest}.`);
    }
    return { bytes, errors };
  } finally {
    clearTimeout(timeout);
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

/** Validate the exact bytes the GenLayer adjudicator will retrieve before an irreversible write-once registration. */
export async function preflightAcceptedProjectDocuments(input: AcceptedProjectInput): Promise<string[]> {
  const documents = await Promise.all([
    fetchReviewDocument(input.baselineUri, "Accepted baseline", input.baselineSha),
    fetchReviewDocument(input.baselineMirrorUri, "Accepted baseline mirror", input.baselineSha),
    fetchReviewDocument(input.acceptanceRecordUri, "Acceptance record", input.acceptanceRecordSha),
    fetchReviewDocument(input.acceptanceRecordMirrorUri, "Acceptance record mirror", input.acceptanceRecordSha),
  ]);
  const errors = documents.flatMap((document) => document.errors);
  const [baseline, baselineMirror, acceptanceRecord, acceptanceRecordMirror] = documents.map((document) => document.bytes);
  if (baseline && baselineMirror && !bytesEqual(baseline, baselineMirror)) {
    errors.push("Accepted baseline and its mirror do not contain identical bytes.");
  }
  if (acceptanceRecord && acceptanceRecordMirror && !bytesEqual(acceptanceRecord, acceptanceRecordMirror)) {
    errors.push("Acceptance record and its mirror do not contain identical bytes.");
  }
  return errors;
}

export function validateSubmission(uri: string, sha256: string, allowedOriginsJson = ""): string[] {
  const errors: string[] = [];
  const uriError = validateHttpsUri(uri, "Submission URI");
  const hashError = validateSha256(sha256, "Submission SHA-256");
  if (uriError) errors.push(uriError);
  if (hashError) errors.push(hashError);
  if (!uriError && allowedOriginsJson.trim()) {
    try {
      const allowedOrigins = JSON.parse(allowedOriginsJson) as unknown;
      const origin = new URL(uri.trim()).origin.toLowerCase();
      if (!Array.isArray(allowedOrigins) || !allowedOrigins.every((value) => typeof value === "string")) {
        errors.push("The registered submission origin policy is invalid.");
      } else if (!allowedOrigins.map((value) => value.toLowerCase()).includes(origin)) {
        errors.push("Submission URI origin is not one of the authority-registered evidence origins.");
      }
    } catch {
      errors.push("The registered submission origin policy is invalid.");
    }
  }
  return errors;
}
