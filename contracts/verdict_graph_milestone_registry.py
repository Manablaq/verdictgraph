# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""GenLayer-native milestone registry and settlement coordinator.

The registry owns the deterministic milestone state machine, accepted-project
trust roots, participant permissions, review requests, and the finality-only
message to the EVM custody rail.  Subjective evidence review lives in the
separate Milestone Adjudicator and can only return through an authenticated,
finalized callback.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, cast

from genlayer import *


ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")

MAX_TITLE_CHARS = 160
MAX_OBJECTIVE_CHARS = 4_000
MAX_PROJECT_REF_CHARS = 160
MAX_MILESTONE_REF_CHARS = 160
MAX_URI_CHARS = 768
MAX_HASH_CHARS = 64
MAX_CRITERIA = 16
MAX_CRITERION_CHARS = 1_200
MAX_SUMMARY_CHARS = 1_200
MAX_CHALLENGE_CHARS = 2_000
MAX_DOCUMENT_BYTES = 48_000
MAX_REVIEW_INPUT_BYTES = 32_000
MAX_REVIEW_PROMPT_BYTES = 64_000
MAX_CHALLENGES = 2
MAX_UINT256 = (1 << 256) - 1
MIN_FUNDING_WINDOW_SECONDS = 900
MIN_SUBMISSION_WINDOW_SECONDS = 900
MIN_RECOVERY_BUFFER_SECONDS = 900
MIN_CHALLENGE_WINDOW_SECONDS = 300
MAX_CHALLENGE_WINDOW_SECONDS = 30 * 24 * 60 * 60
MAX_MILESTONE_HORIZON_SECONDS = 365 * 24 * 60 * 60

MILESTONE_DRAFT = "DRAFT"
MILESTONE_ACTIVE = "ACTIVE"
MILESTONE_SUBMITTED = "SUBMITTED"
MILESTONE_REVIEW_PENDING = "REVIEW_PENDING"
MILESTONE_REVIEWED = "REVIEWED"
MILESTONE_CHALLENGED = "CHALLENGED"
MILESTONE_REPAIR_REQUIRED = "REPAIR_REQUIRED"
MILESTONE_SETTLED = "SETTLED"
MILESTONE_RECOVERED = "RECOVERED"

REVIEW_OK = "OK"
REVIEW_REPAIR_REQUIRED = "REPAIR_REQUIRED"
DECISIONS = ("PASS", "FAIL", "UNDETERMINED")
CONSEQUENCE_PASS = 1
CONSEQUENCE_FAIL = 2
CONSEQUENCE_NEUTRAL = 3


def _fail(message):
    raise gl.vm.UserError(message)


def _address(value):
    if isinstance(value, Address):
        return value
    return Address(value)


def _now():
    return u256(int(datetime.now(timezone.utc).timestamp()))


def _canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256_text(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash(value):
    value = value.strip()
    if len(value) != MAX_HASH_CHARS or not all(char in "0123456789abcdef" for char in value):
        _fail("E1")
    return value


def _bounded_text(value, maximum):
    value = value.strip()
    if not value or len(value) > maximum:
        _fail("E2")
    return value


def _https_uri(value):
    value = _bounded_text(value, MAX_URI_CHARS)
    if not value.startswith("https://") or len(value) <= len("https://") or any(char.isspace() for char in value):
        _fail("E3")
    authority = value[len("https://") :].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    labels = authority.lower().split(".")
    if not authority or "@" in authority or ":" in authority or any(char in authority for char in "\\%<>"):
        _fail("E4")
    if len(labels) == 4 and all(part.isdigit() for part in labels) and all(0 <= int(part) <= 255 for part in labels):
        _fail("E4")
    if len(labels) < 2 or any(
        not part or part[0] == "-" or part[-1] == "-" or not all(char.isascii() and (char.isalnum() or char == "-") for char in part)
        for part in labels
    ):
        _fail("E4")
    if authority.lower() in ("localhost", "localhost.localdomain") or authority.lower().endswith(".local"):
        _fail("E4")
    return value


def _uri_origin(value):
    authority = value[len("https://") :].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    return f"https://{authority.lower()}"


def _submission_origin_allowed(uri, allowed_origins_json):
    try:
        allowed = json.loads(allowed_origins_json)
    except Exception:
        _fail("E5")
    if not isinstance(allowed, list) or not all(isinstance(item, str) for item in allowed):
        _fail("E5")
    return _uri_origin(uri) in allowed


def _normalize_criteria(criteria_json):
    try:
        raw = json.loads(criteria_json)
    except Exception:
        _fail("E6")
    if not isinstance(raw, list) or not raw or len(raw) > MAX_CRITERIA:
        _fail("E7")
    seen = []
    normalized = []
    for item in raw:
        if not isinstance(item, dict):
            _fail("E8")
        criterion_id = item.get("id")
        text = item.get("text")
        if not isinstance(criterion_id, int) or isinstance(criterion_id, bool) or criterion_id <= 0 or criterion_id in seen:
            _fail("E9")
        if not isinstance(text, str):
            _fail("E10")
        seen.append(criterion_id)
        normalized.append({"id": criterion_id, "text": _bounded_text(text, MAX_CRITERION_CHARS)})
    normalized.sort(key=lambda item: item["id"])
    return normalized


def _criterion_exists(criteria, criterion_id):
    return any(item["id"] == criterion_id for item in criteria)


def _validate_review_result(decision, failed_criterion_id, consequence_rule_id, criteria_json):
    if decision not in DECISIONS:
        _fail("E11")
    criteria = json.loads(criteria_json)
    failed = int(failed_criterion_id)
    consequence = int(consequence_rule_id)
    if decision == "FAIL":
        if not _criterion_exists(criteria, failed) or consequence != CONSEQUENCE_FAIL:
            _fail("E12")
    elif failed != 0 or consequence != (CONSEQUENCE_PASS if decision == "PASS" else CONSEQUENCE_NEUTRAL):
        _fail("E13")


@allow_storage
@dataclass
class Milestone:
    project_ref: str
    reference: str
    owner: Address
    beneficiary: Address
    title: str
    objective: str
    baseline_uri: str
    baseline_sha256: str
    criteria_json: str
    submission_origins_json: str
    terms_sha256: str
    principal_required: u256
    beneficiary_bond_required: u256
    funding_deadline: u256
    submission_deadline: u256
    recovery_deadline: u256
    challenge_window_seconds: u256
    status: str
    submission_version: u256
    submission_uri: str
    submission_sha256: str
    sponsor_ready: bool
    beneficiary_ready: bool
    challenge_count: u256
    challenge_reason: str
    challenged_by: Address
    challenged_at: u256
    challenge_deadline: u256
    settlement_earliest_at: u256
    settlement_queued: bool
    settlement_attempt_count: u256
    settlement_last_attempt_at: u256
    latest_review_id: u256
    review_request_id: u256
    review_queued: bool
    repair_failure_code: str
    repair_observed_sha256: str
    created_at: str


@allow_storage
@dataclass
class Submission:
    milestone_id: u256
    version: u256
    uri: str
    sha256: str
    submitted_by: Address
    submitted_at: u256
    created_at: str


@allow_storage
@dataclass
class Review:
    milestone_id: u256
    request_id: u256
    submission_version: u256
    challenge_count: u256
    decision: str
    failed_criterion_id: u256
    consequence_rule_id: u256
    source_set_sha256: str
    summary: str
    review_sha256: str
    resolved_at: str


@allow_storage
@dataclass
class Challenge:
    milestone_id: u256
    challenge_number: u256
    reason: str
    challenged_by: Address
    challenged_at: u256
    resolved_review_id: u256
    created_at: str


@gl.contract_interface
class VerdictGraphMilestoneAdjudicator:
    class View:
        def registry_address(self, /) -> Address: ...

    class Write:
        def review_milestone(self, milestone_id: u256, request_id: u256, context_json: str, /) -> None: ...


@gl.contract_interface
class VerdictGraphMilestoneAuthority:
    class View:
        def get_project_snapshot(self, project_ref: str, /) -> str: ...

    class Write:
        pass


@gl.evm.contract_interface
class VerdictGraphMilestoneVault:
    class View:
        pass

    class Write:
        def register_milestone(self, milestone_id: u256, owner: Address, beneficiary: Address, principal_required: u256, beneficiary_bond_required: u256, funding_deadline: u256, recovery_deadline: u256, terms_sha256: str, /) -> None: ...
        def apply_final_outcome(self, milestone_id: u256, review_id: u256, terms_sha256: str, consequence_rule_id: u256, review_sha256: str, /) -> None: ...
        def recover_active(self, milestone_id: u256, /) -> None: ...


class VerdictGraphMilestoneRegistry(gl.Contract):
    owner: Address
    authority_address: Address
    registry_source_sha256: str
    adjudicator_address: Address
    vault_address: Address
    challenge_history: TreeMap[str, Challenge]
    milestones: TreeMap[u256, Milestone]
    submissions: TreeMap[str, Submission]
    reviews: TreeMap[u256, Review]
    milestone_by_reference: TreeMap[str, u256]
    next_milestone_id: u256
    milestone_count: u256

    def __init__(self, authority_address: str, registry_source_sha256: str):
        self.owner = gl.message.sender_address
        self.authority_address = Address(authority_address)
        if self.authority_address == ZERO_ADDRESS:
            _fail("E14")
        self.registry_source_sha256 = _hash(registry_source_sha256)
        self.adjudicator_address = ZERO_ADDRESS
        self.vault_address = ZERO_ADDRESS
        self.next_milestone_id = u256(1)
        self.milestone_count = u256(0)

    def _require_milestone(self, milestone_id):
        if milestone_id not in self.milestones:
            _fail("E15")

    def _key(self, milestone_id, version):
        return f"{int(milestone_id)}:{int(version)}"

    def _require_participant(self, milestone):
        if gl.message.sender_address not in (milestone.owner, milestone.beneficiary):
            _fail("E16")

    @gl.public.view
    def get_vault_address(self) -> Address:
        return self.vault_address

    @gl.public.view
    def get_adjudicator_address(self) -> Address:
        return self.adjudicator_address

    @gl.public.view
    def get_authority_address(self) -> Address:
        return self.authority_address

    @gl.public.view
    def get_registry_source_sha256(self) -> str:
        return self.registry_source_sha256

    @gl.public.write
    def bind_adjudicator(self, adjudicator_address: str) -> None:
        if gl.message.sender_address != self.owner:
            _fail("E18")
        if self.adjudicator_address != ZERO_ADDRESS:
            _fail("E19")
        adjudicator = _address(adjudicator_address)
        if adjudicator == ZERO_ADDRESS:
            _fail("E20")
        try:
            bound_registry = VerdictGraphMilestoneAdjudicator(adjudicator).view().registry_address()
        except Exception:
            _fail("E21")
        if bound_registry != gl.message.contract_address:
            _fail("E22")
        self.adjudicator_address = adjudicator

    @gl.public.write
    def bind_vault(self, vault_address: str) -> None:
        if gl.message.sender_address != self.owner:
            _fail("E23")
        if self.vault_address != ZERO_ADDRESS:
            _fail("E24")
        if self.adjudicator_address == ZERO_ADDRESS:
            _fail("E25")
        vault = _address(vault_address)
        if vault == ZERO_ADDRESS:
            _fail("E26")
        self.vault_address = vault

    @gl.public.write
    def create_milestone(self, title: str, objective: str, project_ref: str, criteria_json: str, beneficiary_address: str, principal_required: u256, beneficiary_bond_required: u256, funding_deadline: u256, submission_deadline: u256, recovery_deadline: u256, challenge_window_seconds: u256, milestone_reference: str) -> u256:
        title = _bounded_text(title, MAX_TITLE_CHARS)
        objective = _bounded_text(objective, MAX_OBJECTIVE_CHARS)
        project_ref = _bounded_text(project_ref, MAX_PROJECT_REF_CHARS)
        try:
            accepted = json.loads(VerdictGraphMilestoneAuthority(self.authority_address).view().get_project_snapshot(project_ref))
        except Exception:
            _fail("E28")
        if not isinstance(accepted, dict) or int(accepted.get("version", 0)) != 1:
            _fail("E29")
        milestone_reference = _bounded_text(milestone_reference, MAX_MILESTONE_REF_CHARS)
        if milestone_reference in self.milestone_by_reference:
            _fail("E30")
        sponsor = Address(str(accepted.get("sponsor", ZERO_ADDRESS.as_hex)))
        if gl.message.sender_address != sponsor:
            _fail("E31")
        criteria = _normalize_criteria(criteria_json)
        beneficiary = Address(beneficiary_address)
        if beneficiary == ZERO_ADDRESS or beneficiary == gl.message.sender_address:
            _fail("E32")
        if int(principal_required) <= 0 or int(beneficiary_bond_required) <= 0:
            _fail("E33")
        if int(principal_required) + int(beneficiary_bond_required) > MAX_UINT256:
            _fail("E34")
        now = int(_now())
        if int(funding_deadline) - now < MIN_FUNDING_WINDOW_SECONDS:
            _fail("E35")
        if int(submission_deadline) - int(funding_deadline) < MIN_SUBMISSION_WINDOW_SECONDS:
            _fail("E36")
        if int(recovery_deadline) - int(submission_deadline) < MIN_RECOVERY_BUFFER_SECONDS:
            _fail("E37")
        if int(recovery_deadline) - now > MAX_MILESTONE_HORIZON_SECONDS:
            _fail("E38")
        if not MIN_CHALLENGE_WINDOW_SECONDS <= int(challenge_window_seconds) <= MAX_CHALLENGE_WINDOW_SECONDS:
            _fail("E39")

        milestone_id = self.next_milestone_id
        self.next_milestone_id = u256(int(milestone_id) + 1)
        normalized_criteria_json = _canonical_json(criteria)
        terms_payload = [
            int(milestone_id), project_ref, milestone_reference, sponsor.as_hex,
            gl.message.sender_address.as_hex, beneficiary.as_hex, title, objective,
            accepted["baseline_uri"], accepted["baseline_sha256"], accepted["baseline_mirror_uri"],
            accepted["acceptance_record_uri"], accepted["acceptance_record_sha256"],
            accepted["acceptance_record_mirror_uri"], accepted["submission_origins_json"],
            normalized_criteria_json, int(principal_required), int(beneficiary_bond_required),
            int(funding_deadline), int(submission_deadline), int(recovery_deadline),
            int(challenge_window_seconds),
        ]
        self.milestones[milestone_id] = Milestone(
            project_ref, milestone_reference, gl.message.sender_address, beneficiary, title, objective,
            accepted["baseline_uri"], accepted["baseline_sha256"], normalized_criteria_json,
            accepted["submission_origins_json"], _sha256_text(_canonical_json(terms_payload)), principal_required,
            beneficiary_bond_required, funding_deadline, submission_deadline, recovery_deadline,
            challenge_window_seconds, MILESTONE_DRAFT, u256(0), "", "", False, False, u256(0), "",
            ZERO_ADDRESS, u256(0), u256(0), u256(0), False, u256(0), u256(0), u256(0), u256(0),
            False, "", "", gl.message_raw["datetime"],
        )
        self.milestone_by_reference[milestone_reference] = milestone_id
        self.milestone_count = u256(int(self.milestone_count) + 1)
        return milestone_id

    @gl.public.write
    def activate_milestone(self, milestone_id: u256) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.owner != gl.message.sender_address:
            _fail("E40")
        if milestone.status != MILESTONE_DRAFT:
            _fail("E41")
        milestone.status = MILESTONE_ACTIVE

    @gl.public.write
    def register_milestone_in_vault(self, milestone_id: u256) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if gl.message.sender_address != milestone.owner:
            _fail("E42")
        if milestone.status != MILESTONE_ACTIVE:
            _fail("E43")
        if self.vault_address == ZERO_ADDRESS:
            _fail("E44")
        cast(Any, VerdictGraphMilestoneVault(self.vault_address).emit)(on="finalized").register_milestone(
            milestone_id, milestone.owner, milestone.beneficiary, milestone.principal_required,
            milestone.beneficiary_bond_required, milestone.funding_deadline, milestone.recovery_deadline, milestone.terms_sha256,
        )

    @gl.public.write
    def submit_milestone(self, milestone_id: u256, submission_uri: str, submission_sha256: str) -> u256:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.beneficiary != gl.message.sender_address:
            _fail("E45")
        if milestone.status not in (MILESTONE_ACTIVE, MILESTONE_REPAIR_REQUIRED):
            _fail("E46")
        if int(_now()) > int(milestone.submission_deadline):
            _fail("E47")
        submission_uri = _https_uri(submission_uri)
        if not _submission_origin_allowed(submission_uri, milestone.submission_origins_json):
            _fail("E48")
        version = u256(int(milestone.submission_version) + 1)
        submission_sha256 = _hash(submission_sha256)
        self.submissions[self._key(milestone_id, version)] = Submission(
            milestone_id, version, submission_uri, submission_sha256, gl.message.sender_address,
            _now(), gl.message_raw["datetime"],
        )
        milestone.submission_version = version
        milestone.submission_uri = submission_uri
        milestone.submission_sha256 = submission_sha256
        milestone.sponsor_ready = False
        milestone.beneficiary_ready = False
        milestone.challenge_reason = ""
        milestone.challenged_by = ZERO_ADDRESS
        milestone.challenged_at = u256(0)
        milestone.review_queued = False
        milestone.repair_failure_code = ""
        milestone.repair_observed_sha256 = ""
        milestone.status = MILESTONE_SUBMITTED
        return version

    @gl.public.write
    def mark_milestone_ready(self, milestone_id: u256) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.status != MILESTONE_SUBMITTED:
            _fail("E49")
        self._require_participant(milestone)
        if gl.message.sender_address == milestone.owner:
            milestone.sponsor_ready = True
        if gl.message.sender_address == milestone.beneficiary:
            milestone.beneficiary_ready = True

    def _queue_review(self, milestone_id, milestone, challenge_text):
        if self.adjudicator_address == ZERO_ADDRESS:
            _fail("E50")
        milestone.review_request_id = u256(int(milestone.review_request_id) + 1)
        milestone.review_queued = True
        milestone.status = MILESTONE_REVIEW_PENDING
        context_json = self.get_review_context(milestone_id, milestone.review_request_id)
        if str(json.loads(context_json)[16]) != challenge_text:
            _fail("E75")
        cast(Any, VerdictGraphMilestoneAdjudicator(self.adjudicator_address).emit)(on="finalized").review_milestone(
            milestone_id, milestone.review_request_id, context_json,
        )
        return u256(0)

    @gl.public.write
    def resolve_milestone(self, milestone_id: u256) -> u256:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.status != MILESTONE_SUBMITTED:
            _fail("E51")
        if milestone.review_queued:
            _fail("E52")
        if not (milestone.sponsor_ready and milestone.beneficiary_ready) and int(_now()) < int(milestone.submission_deadline):
            _fail("E53")
        if int(_now()) > int(milestone.recovery_deadline):
            _fail("E54")
        return self._queue_review(milestone_id, milestone, "")

    @gl.public.write
    def retry_milestone_review(self, milestone_id: u256) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.status != MILESTONE_REVIEW_PENDING or not milestone.review_queued:
            _fail("E55")
        self._require_participant(milestone)
        if int(_now()) > int(milestone.recovery_deadline):
            _fail("E54")
        context_json = self.get_review_context(milestone_id, milestone.review_request_id)
        cast(Any, VerdictGraphMilestoneAdjudicator(self.adjudicator_address).emit)(on="finalized").review_milestone(
            milestone_id, milestone.review_request_id, context_json,
        )

    @gl.public.write
    def challenge_milestone(self, milestone_id: u256, reason: str) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.status != MILESTONE_REVIEWED or milestone.settlement_queued:
            _fail("E56")
        self._require_participant(milestone)
        if int(_now()) > int(milestone.challenge_deadline):
            _fail("E57")
        if int(milestone.challenge_count) >= MAX_CHALLENGES:
            _fail("E58")
        milestone.challenge_reason = _bounded_text(reason, MAX_CHALLENGE_CHARS)
        milestone.challenged_by = gl.message.sender_address
        milestone.challenged_at = _now()
        milestone.challenge_count = u256(int(milestone.challenge_count) + 1)
        self.challenge_history[self._key(milestone_id, milestone.challenge_count)] = Challenge(
            milestone_id, milestone.challenge_count, milestone.challenge_reason, milestone.challenged_by,
            milestone.challenged_at, u256(0), gl.message_raw["datetime"],
        )
        milestone.status = MILESTONE_CHALLENGED

    @gl.public.write
    def resolve_challenge(self, milestone_id: u256) -> u256:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.status != MILESTONE_CHALLENGED:
            _fail("E59")
        self._require_participant(milestone)
        if int(_now()) > int(milestone.recovery_deadline):
            _fail("E54")
        return self._queue_review(milestone_id, milestone, milestone.challenge_reason)

    @gl.public.write
    def record_review(self, milestone_id: u256, request_id: u256, review_id: u256, submission_version: u256, challenge_count: u256, result_status: str, decision: str, failed_criterion_id: u256, consequence_rule_id: u256, source_set_sha256: str, summary: str, review_sha256: str, failure_code: str, observed_sha256: str) -> None:
        if gl.message.sender_address != self.adjudicator_address:
            _fail("E60")
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if int(request_id) != int(milestone.review_request_id):
            _fail("E61")
        if milestone.status in (MILESTONE_REVIEWED, MILESTONE_REPAIR_REQUIRED) and not milestone.review_queued:
            if result_status == REVIEW_OK and review_id in self.reviews and self.reviews[review_id].review_sha256 == review_sha256:
                return
            if result_status == REVIEW_REPAIR_REQUIRED and milestone.repair_failure_code == failure_code and milestone.repair_observed_sha256 == observed_sha256:
                return
            _fail("E62")
        if result_status == REVIEW_REPAIR_REQUIRED:
            if failure_code == "" or (observed_sha256 and not (len(observed_sha256) == 64 and all(char in "0123456789abcdef" for char in observed_sha256))):
                _fail("E63")
            milestone.status = MILESTONE_REPAIR_REQUIRED
            milestone.review_queued = False
            milestone.repair_failure_code = _bounded_text(failure_code, 160)
            milestone.repair_observed_sha256 = observed_sha256
            return
        if result_status != REVIEW_OK:
            _fail("E64")
        if int(review_id) <= 0:
            _fail("E65")
        if int(submission_version) != int(milestone.submission_version) or int(challenge_count) != int(milestone.challenge_count):
            _fail("E66")
        summary = _bounded_text(summary, MAX_SUMMARY_CHARS)
        source_set_sha256 = _hash(source_set_sha256)
        review_sha256 = _hash(review_sha256)
        _validate_review_result(decision, failed_criterion_id, consequence_rule_id, milestone.criteria_json)
        payload = [
            int(milestone_id), int(submission_version), int(challenge_count), decision,
            int(failed_criterion_id), int(consequence_rule_id), source_set_sha256,
        ]
        if _sha256_text(_canonical_json(payload)) != review_sha256:
            _fail("E67")
        if review_id in self.reviews:
            existing = self.reviews[review_id]
            if (
                existing.milestone_id == milestone_id
                and existing.request_id == request_id
                and existing.review_sha256 == review_sha256
            ):
                return
            _fail("E68")
        self.reviews[review_id] = Review(
            milestone_id, request_id, submission_version, challenge_count, decision, failed_criterion_id,
            consequence_rule_id, source_set_sha256, summary, review_sha256, gl.message_raw["datetime"],
        )
        milestone.status = MILESTONE_REVIEWED
        milestone.review_queued = False
        milestone.latest_review_id = review_id
        milestone.challenge_deadline = u256(int(_now()) + int(milestone.challenge_window_seconds))
        milestone.settlement_earliest_at = milestone.challenge_deadline
        milestone.settlement_queued = False
        milestone.settlement_attempt_count = u256(0)
        milestone.settlement_last_attempt_at = u256(0)
        milestone.repair_failure_code = ""
        milestone.repair_observed_sha256 = ""
        if int(challenge_count) > 0:
            challenge = self.challenge_history[self._key(milestone_id, challenge_count)]
            challenge.resolved_review_id = review_id

    @gl.public.view
    def get_review_context(self, milestone_id: u256, request_id: u256) -> str:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if milestone.status != MILESTONE_REVIEW_PENDING or int(request_id) != int(milestone.review_request_id):
            _fail("E69")
        key = self._key(milestone_id, milestone.submission_version)
        if key not in self.submissions:
            _fail("E70")
        try:
            accepted = json.loads(VerdictGraphMilestoneAuthority(self.authority_address).view().get_project_snapshot(milestone.project_ref))
        except Exception:
            _fail("E28")
        if not isinstance(accepted, dict) or int(accepted.get("version", 0)) != 1:
            _fail("E71")
        submission = gl.storage.copy_to_memory(self.submissions[key])
        return _canonical_json([
            int(milestone_id), int(request_id), milestone.project_ref, milestone.title, milestone.objective,
            milestone.criteria_json, milestone.baseline_uri, milestone.baseline_sha256,
            accepted["baseline_mirror_uri"], accepted["acceptance_record_uri"],
            accepted["acceptance_record_sha256"], accepted["acceptance_record_mirror_uri"],
            int(submission.version), submission.uri, submission.sha256,
            int(milestone.challenge_count), milestone.challenge_reason, milestone.terms_sha256,
            int(milestone.recovery_deadline),
        ])

    @gl.public.write
    def queue_settlement(self, milestone_id: u256, expected_review_id: u256) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if self.vault_address == ZERO_ADDRESS:
            _fail("E44")
        if milestone.status != MILESTONE_REVIEWED:
            _fail("E72")
        if expected_review_id != milestone.latest_review_id or int(expected_review_id) <= 0:
            _fail("E73")
        if not milestone.settlement_queued and int(_now()) <= int(milestone.settlement_earliest_at):
            _fail("E74")
        if int(_now()) > int(milestone.recovery_deadline):
            _fail("E54")
        review = self.reviews[expected_review_id]
        milestone.settlement_queued = True
        milestone.settlement_attempt_count = u256(int(milestone.settlement_attempt_count) + 1)
        milestone.settlement_last_attempt_at = _now()
        cast(Any, VerdictGraphMilestoneVault(self.vault_address).emit)(on="finalized").apply_final_outcome(
            milestone_id, expected_review_id, milestone.terms_sha256, review.consequence_rule_id, review.review_sha256,
        )

    @gl.public.write
    def recover_milestone(self, milestone_id: u256) -> None:
        self._require_milestone(milestone_id)
        milestone = self.milestones[milestone_id]
        if self.vault_address == ZERO_ADDRESS:
            _fail("E44")
        if milestone.status in (MILESTONE_SETTLED, MILESTONE_RECOVERED):
            _fail("E75")
        if int(_now()) <= int(milestone.recovery_deadline):
            _fail("E76")
        milestone.settlement_queued = True
        milestone.settlement_attempt_count = u256(int(milestone.settlement_attempt_count) + 1)
        milestone.settlement_last_attempt_at = _now()
        cast(Any, VerdictGraphMilestoneVault(self.vault_address).emit)(on="finalized").recover_active(milestone_id)

    @gl.public.view
    def get_milestone_count(self) -> u256:
        return self.milestone_count

    @gl.public.view
    def get_milestone_for_reference(self, milestone_reference: str) -> u256:
        milestone_reference = _bounded_text(milestone_reference, MAX_MILESTONE_REF_CHARS)
        if milestone_reference not in self.milestone_by_reference:
            _fail("E77")
        return self.milestone_by_reference[milestone_reference]

    @gl.public.view
    def get_milestone(self, milestone_id: u256) -> Milestone:
        self._require_milestone(milestone_id)
        return self.milestones[milestone_id]

    @gl.public.view
    def get_submission(self, milestone_id: u256, version: u256) -> Submission:
        self._require_milestone(milestone_id)
        key = self._key(milestone_id, version)
        if key not in self.submissions:
            _fail("E78")
        return self.submissions[key]

    @gl.public.view
    def get_review(self, review_id: u256) -> Review:
        if review_id not in self.reviews:
            _fail("E79")
        return self.reviews[review_id]

    @gl.public.view
    def get_challenge(self, milestone_id: u256, challenge_number: u256) -> Challenge:
        self._require_milestone(milestone_id)
        key = self._key(milestone_id, challenge_number)
        if key not in self.challenge_history:
            _fail("E80")
        return self.challenge_history[key]
