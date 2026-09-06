# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""VerdictGraph Core v0.1.

GenLayer-native adjudication for explicit handoffs in autonomous workflows.
The consensus-critical decision is deliberately narrow: validators independently
fetch the registered evidence, verify its pinned bytes, apply pre-registered
handoff rules, and exactly agree on the consequential decision fields.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from typing import NoReturn
from genlayer import *

ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")

MAX_TITLE_CHARS = 160
MAX_TEXT_CHARS = 4_000
MAX_URI_CHARS = 768
MAX_ID_CHARS = 160
MAX_PUBLISHER_PREFIX_CHARS = 512
MAX_EVIDENCE_ITEMS = 8
MAX_EVIDENCE_BYTES = 24_000
MAX_RESPONSE_BYTES = 24_000
MAX_DELIVERY_BYTES = 48_000
MAX_TOTAL_EVIDENCE_BYTES = 96_000
MAX_CRITERIA = 16
MAX_POLICY_ISSUERS = 16
MAX_POLICY_PUBLISHERS = 16
MAX_HANDOFFS_PER_WORKFLOW = 32
MAX_DEPENDENCIES_PER_HANDOFF = 16
MAX_SUMMARY_CHARS = 1_200

CASE_OPEN = "OPEN"
CASE_REVIEWED = "REVIEWED"
CASE_REPAIR_REQUIRED = "REPAIR_REQUIRED"
CASE_RECOVERED = "RECOVERED"
CASE_SETTLED = "SETTLED"

REVISION_OPEN = "OPEN"
REVISION_REVIEWED = "REVIEWED"
REVISION_REPAIR_REQUIRED = "REPAIR_REQUIRED"

WORKFLOW_DRAFT = "DRAFT"
WORKFLOW_ACTIVE = "ACTIVE"
WORKFLOW_CLOSED = "CLOSED"

DECISIONS = ("NO_BREACH", "BREACH", "UNDETERMINED")
FAULT_CLASSES = (
    "INCOMPLETE_DELIVERY",
    "INCORRECT_DELIVERY",
    "MISSED_DEADLINE",
    "SOURCE_FAILURE",
    "VERIFICATION_FAILURE",
    "POLICY_BREACH",
    "MISUSE_OF_VALID_INPUT",
    "OTHER_MATERIAL_BREACH",
)

# These are deterministic settlement templates consumed by the Vault.
CONSEQUENCE_RELEASE_PROVIDER = 1
CONSEQUENCE_PROVIDER_BREACH = 2
CONSEQUENCE_NEUTRAL_RECOVERY = 3
CONSEQUENCE_RULES = (
    CONSEQUENCE_RELEASE_PROVIDER,
    CONSEQUENCE_PROVIDER_BREACH,
    CONSEQUENCE_NEUTRAL_RECOVERY,
)


def _fail(message: str) -> NoReturn:
    raise gl.vm.UserError(message)


def _now() -> u256:
    return u256(int(datetime.now(timezone.utc).timestamp()))


def _http_status(response) -> int:
    """Return an HTTP status across production and Direct Mode response shapes.

    The public GenLayer web API documents ``status_code`` while the pinned
    Direct Mode harness currently decodes its mocked response with ``status``.
    Accept both representations without weakening the 2xx requirement. A
    malformed/missing status maps to 0 so the caller persists a repairable
    fetch failure instead of proceeding with untrusted bytes.
    """
    status = getattr(response, "status_code", None)
    if status is None:
        status = getattr(response, "status", None)
    if not isinstance(status, int) or isinstance(status, bool):
        return 0
    return status


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_text(value: str) -> str:
    return _sha256_bytes(value.encode("utf-8"))


def _is_lower_hex_64(value: str) -> bool:
    if len(value) != 64:
        return False
    for char in value:
        if char not in "0123456789abcdef":
            return False
    return True


def _bounded_text(value: str, label: str, maximum: int, allow_empty: bool = False) -> str:
    value = value.strip()
    if (not allow_empty and not value) or len(value) > maximum:
        _fail(f"{label} is empty or too long")
    return value


def _address_key(address: Address) -> str:
    return address.as_hex.lower()


def _policy_key(policy_id: u256, suffix: str) -> str:
    return f"{int(policy_id)}:{suffix}"


def _revision_key(case_id: u256, revision_no: u256, suffix: str) -> str:
    return f"{int(case_id)}:{int(revision_no)}:{suffix}"


def _publisher_origin(publisher_prefix: str) -> str:
    # Publisher prefixes are already required to use HTTPS. Diversity is counted
    # by origin host, not arbitrary path prefix, so one publisher cannot satisfy
    # corroboration by registering multiple folders on the same host.
    if not publisher_prefix.startswith("https://"):
        _fail("Publisher prefix must use HTTPS")
    remainder = publisher_prefix[len("https://") :]
    host = remainder.split("/", 1)[0].strip().lower()
    if (
        not host
        or "@" in host
        or "?" in host
        or "#" in host
        or " " in host
        or "\t" in host
        or "\n" in host
    ):
        _fail("Publisher prefix has an invalid HTTPS origin")
    return "https://" + host


def _normalize_criteria(criteria_json: str) -> list[dict]:
    try:
        raw = json.loads(criteria_json)
    except Exception:
        _fail("Criteria must be valid JSON")

    if not isinstance(raw, list) or not raw or len(raw) > MAX_CRITERIA:
        _fail("Criteria must be a non-empty bounded JSON array")

    seen: list[int] = []
    normalized: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            _fail("Each criterion must be an object")

        rule_id = item.get("id")
        text = item.get("text")
        fault_class = item.get("fault_class")
        consequence_rule_id = item.get("consequence_rule_id")

        if not isinstance(rule_id, int) or isinstance(rule_id, bool) or rule_id <= 0:
            _fail("Criterion id must be a positive integer")
        if rule_id in seen:
            _fail("Criterion ids must be unique")
        seen.append(rule_id)

        if not isinstance(text, str):
            _fail("Criterion text must be a string")
        text = _bounded_text(text, "Criterion text", 1_200)

        if not isinstance(fault_class, str):
            _fail("Criterion fault_class must be a string")
        fault_class = fault_class.strip().upper()
        if fault_class not in FAULT_CLASSES:
            _fail("Unsupported criterion fault_class")

        if (
            not isinstance(consequence_rule_id, int)
            or isinstance(consequence_rule_id, bool)
            or consequence_rule_id not in CONSEQUENCE_RULES
            or consequence_rule_id == CONSEQUENCE_RELEASE_PROVIDER
        ):
            _fail("Breach criteria must map to a supported breach/recovery consequence")

        normalized.append(
            {
                "id": rule_id,
                "text": text,
                "fault_class": fault_class,
                "consequence_rule_id": consequence_rule_id,
            }
        )

    normalized.sort(key=lambda item: item["id"])
    return normalized


def _criterion_by_id(criteria: list[dict], rule_id: int):
    for criterion in criteria:
        if criterion["id"] == rule_id:
            return criterion
    return None

@allow_storage
@dataclass
class EvidencePolicy:
    owner: Address
    title: str
    version: u256
    max_evidence_age_seconds: u256
    minimum_remaining_validity_seconds: u256
    minimum_distinct_issuers: u256
    minimum_distinct_publishers: u256
    response_window_seconds: u256
    repair_window_seconds: u256
    review_recovery_seconds: u256
    issuer_count: u256
    publisher_count: u256
    sealed: bool
    fingerprint_sha256: str
    created_at: str


@allow_storage
@dataclass
class Workflow:
    owner: Address
    title: str
    mission: str
    policy_id: u256
    status: str
    handoff_count: u256
    deadline: u256
    created_at: str


@allow_storage
@dataclass
class DeliveryRecord:
    handoff_id: u256
    version: u256
    provider: Address
    delivery_uri: str
    delivery_sha256: str
    submitted_at: u256
    created_at: str


@allow_storage
@dataclass
class Handoff:
    workflow_id: u256
    ordinal: u256
    requester: Address
    provider: Address
    responsibility: str
    criteria_json: str
    principal_required: u256
    provider_bond_required: u256
    funding_deadline: u256
    deadline: u256
    recovery_deadline: u256
    dependency_count: u256
    delivery_version: u256
    delivery_uri: str
    delivery_sha256: str
    delivery_submitted_at: u256
    delivery_accepted_at: u256
    completion_queued: bool
    completion_attempt_count: u256
    completion_last_attempt_at: u256
    vault_terminal_status: u256
    active: bool


@gl.evm.contract_interface
class VerdictGraphVault:
    class View:
        def registry_core(self) -> Address: ...
        def adjudicator_core(self) -> Address: ...
        def handoff_status(self, handoff_id: u256, /) -> u256: ...
    class Write:
        def register_handoff(self, workflow_id: u256, handoff_id: u256, policy_fingerprint_sha256: str, requester: Address, provider: Address, principal_required: u256, provider_bond_required: u256, funding_deadline: u256, recovery_deadline: u256, /) -> None: ...
        def apply_handoff_completion(self, workflow_id: u256, handoff_id: u256, policy_fingerprint_sha256: str, delivery_sha256: str, /) -> None: ...

@gl.contract_interface
class VerdictGraphAdjudicator:
    class View:
        def registry_address(self) -> Address: ...
        def get_case_repair_snapshot(self, case_id: u256, /) -> str: ...
    class Write:
        def initialize_case(self, case_id: u256, /) -> None: ...


class VerdictGraphRegistry(gl.Contract):
    owner: Address
    vault_address: Address
    adjudicator_address: Address
    policies: TreeMap[u256, EvidencePolicy]
    latest_policy_by_owner: TreeMap[Address, u256]
    policy_issuer_index: TreeMap[str, Address]
    policy_issuers: TreeMap[str, bool]
    policy_publisher_index: TreeMap[str, str]
    policy_publishers: TreeMap[str, bool]
    policy_publisher_origins: TreeMap[str, bool]
    workflows: TreeMap[u256, Workflow]
    latest_workflow_by_owner: TreeMap[Address, u256]
    handoffs: TreeMap[u256, Handoff]
    deliveries: TreeMap[str, DeliveryRecord]
    latest_handoff_by_workflow: TreeMap[u256, u256]
    workflow_handoff_index: TreeMap[str, u256]
    handoff_dependency_index: TreeMap[str, u256]
    handoff_dependency_seen: TreeMap[str, bool]
    handoff_case_id: TreeMap[u256, u256]
    case_context_json: TreeMap[u256, str]
    latest_case_by_opener: TreeMap[Address, u256]
    next_policy_id: u256
    next_workflow_id: u256
    next_handoff_id: u256
    next_case_id: u256

    def __init__(self):
        self.owner = gl.message.sender_address
        self.vault_address = ZERO_ADDRESS
        self.adjudicator_address = ZERO_ADDRESS
        self.next_policy_id = u256(1); self.next_workflow_id = u256(1); self.next_handoff_id = u256(1); self.next_case_id = u256(1)
    def _require_policy(self, policy_id: u256) -> None:
        if policy_id not in self.policies: _fail("Unknown evidence policy")
    def _require_workflow(self, workflow_id: u256) -> None:
        if workflow_id not in self.workflows: _fail("Unknown workflow")
    def _require_handoff(self, handoff_id: u256) -> None:
        if handoff_id not in self.handoffs: _fail("Unknown handoff")
    def _delivery_storage_key(self, handoff_id: u256, version: u256) -> str: return f"{int(handoff_id)}:{int(version)}"
    def _require_handoff_participant(self, handoff: Handoff) -> None:
        if gl.message.sender_address not in (handoff.requester, handoff.provider): _fail("Only a handoff participant can perform this action")

    @gl.public.write
    def bind_adjudicator(self, adjudicator_address: str) -> None:
        if gl.message.sender_address != self.owner: _fail("Only the registry owner can bind the adjudicator")
        if self.adjudicator_address != ZERO_ADDRESS: _fail("Adjudicator is already bound")
        adjudicator = Address(adjudicator_address)
        if adjudicator == ZERO_ADDRESS: _fail("Adjudicator cannot be the zero address")
        try: bound_registry = VerdictGraphAdjudicator(adjudicator).view().registry_address()
        except Exception: _fail("Adjudicator registry binding could not be verified")
        if bound_registry != gl.message.contract_address: _fail("Adjudicator registry binding does not match this contract")
        self.adjudicator_address = adjudicator

    @gl.public.write
    def bind_vault(self, vault_address: str) -> None:
        if gl.message.sender_address != self.owner: _fail("Only the registry owner can bind the vault")
        if self.vault_address != ZERO_ADDRESS: _fail("Vault is already bound")
        if self.adjudicator_address == ZERO_ADDRESS: _fail("Adjudicator must be bound first")
        vault = Address(vault_address)
        if vault == ZERO_ADDRESS: _fail("Vault cannot be the zero address")
        try:
            registry_core = VerdictGraphVault(vault).view().registry_core(); adjudicator_core = VerdictGraphVault(vault).view().adjudicator_core()
        except Exception: _fail("Vault controller bindings could not be verified")
        if registry_core != gl.message.contract_address: _fail("Vault registry binding does not match this contract")
        if adjudicator_core != self.adjudicator_address: _fail("Vault adjudicator binding does not match the bound adjudicator")
        self.vault_address = vault

    @gl.public.write
    def create_evidence_policy(
        self,
        title: str,
        version: u256,
        max_evidence_age_seconds: u256,
        minimum_remaining_validity_seconds: u256,
        minimum_distinct_issuers: u256,
        minimum_distinct_publishers: u256,
        response_window_seconds: u256,
        repair_window_seconds: u256,
        review_recovery_seconds: u256,
    ) -> u256:
        title = _bounded_text(title, "Policy title", MAX_TITLE_CHARS)
        if int(version) <= 0:
            _fail("Policy version must be positive")
        if int(max_evidence_age_seconds) <= 0:
            _fail("Evidence freshness window must be positive")
        if int(minimum_remaining_validity_seconds) <= 0:
            _fail("Minimum remaining evidence validity must be positive")
        if int(minimum_distinct_issuers) < 2 or int(minimum_distinct_publishers) < 2:
            _fail("VerdictGraph V1 requires at least two independent issuers and publishers")
        if int(minimum_distinct_issuers) > MAX_POLICY_ISSUERS:
            _fail("Policy issuer threshold exceeds the V1 bound")
        if int(minimum_distinct_publishers) > MAX_POLICY_PUBLISHERS:
            _fail("Policy publisher threshold exceeds the V1 bound")
        if int(response_window_seconds) <= 0 or int(repair_window_seconds) <= 0:
            _fail("Response and repair windows must be positive")
        if int(review_recovery_seconds) <= int(response_window_seconds):
            _fail("Review recovery window must exceed response window")
        if int(review_recovery_seconds) <= int(repair_window_seconds):
            _fail("Review recovery window must exceed repair window")

        policy_id = self.next_policy_id
        self.next_policy_id = u256(int(self.next_policy_id) + 1)
        self.policies[policy_id] = EvidencePolicy(
            owner=gl.message.sender_address,
            title=title,
            version=version,
            max_evidence_age_seconds=max_evidence_age_seconds,
            minimum_remaining_validity_seconds=minimum_remaining_validity_seconds,
            minimum_distinct_issuers=minimum_distinct_issuers,
            minimum_distinct_publishers=minimum_distinct_publishers,
            response_window_seconds=response_window_seconds,
            repair_window_seconds=repair_window_seconds,
            review_recovery_seconds=review_recovery_seconds,
            issuer_count=u256(0),
            publisher_count=u256(0),
            sealed=False,
            fingerprint_sha256="",
            created_at=gl.message_raw["datetime"],
        )
        self.latest_policy_by_owner[gl.message.sender_address] = policy_id
        return policy_id

    @gl.public.write
    def add_policy_issuer(self, policy_id: u256, issuer_address: str) -> None:
        self._require_policy(policy_id)
        policy = self.policies[policy_id]
        if gl.message.sender_address != policy.owner:
            _fail("Only the policy owner can add issuers")
        if policy.sealed:
            _fail("Sealed policy cannot be changed")
        issuer = Address(issuer_address)
        if issuer == ZERO_ADDRESS:
            _fail("Approved issuer cannot be the zero address")
        if int(policy.issuer_count) >= MAX_POLICY_ISSUERS:
            _fail("Policy issuer limit reached")
        key = _policy_key(policy_id, "issuer:" + _address_key(issuer))
        if key in self.policy_issuers:
            _fail("Issuer already approved")

        index_key = _policy_key(policy_id, "issuer-index:" + str(int(policy.issuer_count)))
        self.policy_issuer_index[index_key] = issuer
        self.policy_issuers[key] = True
        policy.issuer_count = u256(int(policy.issuer_count) + 1)

    @gl.public.write
    def add_policy_publisher(self, policy_id: u256, publisher_prefix: str) -> None:
        self._require_policy(policy_id)
        policy = self.policies[policy_id]
        if gl.message.sender_address != policy.owner:
            _fail("Only the policy owner can add publishers")
        if policy.sealed:
            _fail("Sealed policy cannot be changed")

        if int(policy.publisher_count) >= MAX_POLICY_PUBLISHERS:
            _fail("Policy publisher limit reached")
        publisher_prefix = _bounded_text(
            publisher_prefix, "Publisher prefix", MAX_PUBLISHER_PREFIX_CHARS
        )
        if not publisher_prefix.startswith("https://"):
            _fail("Publisher prefix must use HTTPS")
        if not publisher_prefix.endswith("/"):
            _fail("Publisher prefix must end with a slash boundary")
        origin = _publisher_origin(publisher_prefix)
        origin_key = _policy_key(policy_id, "publisher-origin:" + origin)
        if origin_key in self.policy_publisher_origins:
            _fail("Policy publisher origins must be distinct")
        key = _policy_key(policy_id, "publisher:" + publisher_prefix)
        if key in self.policy_publishers:
            _fail("Publisher already approved")

        index_key = _policy_key(policy_id, "publisher-index:" + str(int(policy.publisher_count)))
        self.policy_publisher_index[index_key] = publisher_prefix
        self.policy_publishers[key] = True
        self.policy_publisher_origins[origin_key] = True
        policy.publisher_count = u256(int(policy.publisher_count) + 1)

    @gl.public.write
    def seal_evidence_policy(self, policy_id: u256) -> str:
        self._require_policy(policy_id)
        policy = self.policies[policy_id]
        if gl.message.sender_address != policy.owner:
            _fail("Only the policy owner can seal it")
        if policy.sealed:
            _fail("Policy is already sealed")
        if int(policy.issuer_count) < int(policy.minimum_distinct_issuers):
            _fail("Not enough approved issuers for the policy threshold")
        if int(policy.publisher_count) < int(policy.minimum_distinct_publishers):
            _fail("Not enough approved publishers for the policy threshold")

        issuers: list[str] = []
        for index in range(int(policy.issuer_count)):
            key = _policy_key(policy_id, "issuer-index:" + str(index))
            issuers.append(_address_key(self.policy_issuer_index[key]))
        publishers: list[str] = []
        for index in range(int(policy.publisher_count)):
            key = _policy_key(policy_id, "publisher-index:" + str(index))
            publishers.append(self.policy_publisher_index[key])

        issuers.sort()
        publishers.sort()

        fingerprint_payload = {
            "policy_id": int(policy_id),
            "owner": _address_key(policy.owner),
            "version": int(policy.version),
            "max_evidence_age_seconds": int(policy.max_evidence_age_seconds),
            "minimum_remaining_validity_seconds": int(policy.minimum_remaining_validity_seconds),
            "minimum_distinct_issuers": int(policy.minimum_distinct_issuers),
            "minimum_distinct_publishers": int(policy.minimum_distinct_publishers),
            "response_window_seconds": int(policy.response_window_seconds),
            "repair_window_seconds": int(policy.repair_window_seconds),
            "review_recovery_seconds": int(policy.review_recovery_seconds),
            "approved_issuers": issuers,
            "approved_publishers": publishers,
        }
        policy.fingerprint_sha256 = _sha256_text(_canonical_json(fingerprint_payload))
        policy.sealed = True
        return policy.fingerprint_sha256

    @gl.public.write
    def create_workflow(
        self,
        title: str,
        mission: str,
        policy_id: u256,
        deadline: u256,
    ) -> u256:
        self._require_policy(policy_id)
        policy = self.policies[policy_id]
        if not policy.sealed:
            _fail("Workflow requires a sealed evidence policy")
        if int(deadline) <= int(_now()):
            _fail("Workflow deadline must be in the future")

        workflow_id = self.next_workflow_id
        self.next_workflow_id = u256(int(self.next_workflow_id) + 1)
        self.workflows[workflow_id] = Workflow(
            owner=gl.message.sender_address,
            title=_bounded_text(title, "Workflow title", MAX_TITLE_CHARS),
            mission=_bounded_text(mission, "Workflow mission", MAX_TEXT_CHARS),
            policy_id=policy_id,
            status=WORKFLOW_DRAFT,
            handoff_count=u256(0),
            deadline=deadline,
            created_at=gl.message_raw["datetime"],
        )
        self.latest_workflow_by_owner[gl.message.sender_address] = workflow_id
        return workflow_id

    @gl.public.write
    def add_handoff(
        self,
        workflow_id: u256,
        requester_address: str,
        provider_address: str,
        responsibility: str,
        criteria_json: str,
        principal_required: u256,
        provider_bond_required: u256,
        funding_deadline: u256,
        deadline: u256,
        recovery_deadline: u256,
    ) -> u256:
        self._require_workflow(workflow_id)
        workflow = self.workflows[workflow_id]
        if gl.message.sender_address != workflow.owner:
            _fail("Only the workflow owner can add handoffs")
        if workflow.status != WORKFLOW_DRAFT:
            _fail("Handoffs can only be added to a draft workflow")
        if int(workflow.handoff_count) >= MAX_HANDOFFS_PER_WORKFLOW:
            _fail("Workflow handoff limit reached")
        now = _now()
        if int(principal_required) <= 0:
            _fail("Handoff principal must be positive")
        if int(provider_bond_required) <= 0:
            _fail("Provider bond must be positive")
        if int(funding_deadline) <= int(now):
            _fail("Funding deadline must be in the future")
        if int(deadline) <= int(funding_deadline):
            _fail("Handoff deadline must follow the funding deadline")
        if int(recovery_deadline) <= int(deadline):
            _fail("Recovery deadline must follow the handoff deadline")
        if int(recovery_deadline) > int(workflow.deadline):
            _fail("Handoff recovery deadline must be within workflow deadline")

        requester = Address(requester_address)
        provider = Address(provider_address)
        if requester == ZERO_ADDRESS or provider == ZERO_ADDRESS or requester == provider:
            _fail("Handoff requires two distinct non-zero participants")

        normalized_criteria = _normalize_criteria(criteria_json)
        canonical_criteria = _canonical_json(normalized_criteria)

        handoff_id = self.next_handoff_id
        self.next_handoff_id = u256(int(self.next_handoff_id) + 1)
        ordinal = workflow.handoff_count
        workflow.handoff_count = u256(int(workflow.handoff_count) + 1)

        self.handoffs[handoff_id] = Handoff(
            workflow_id=workflow_id,
            ordinal=ordinal,
            requester=requester,
            provider=provider,
            responsibility=_bounded_text(
                responsibility, "Handoff responsibility", MAX_TEXT_CHARS
            ),
            criteria_json=canonical_criteria,
            principal_required=principal_required,
            provider_bond_required=provider_bond_required,
            funding_deadline=funding_deadline,
            deadline=deadline,
            recovery_deadline=recovery_deadline,
            dependency_count=u256(0),
            delivery_version=u256(0),
            delivery_uri="",
            delivery_sha256="",
            delivery_submitted_at=u256(0),
            delivery_accepted_at=u256(0),
            completion_queued=False,
            completion_attempt_count=u256(0),
            completion_last_attempt_at=u256(0),
            vault_terminal_status=u256(0),
            active=True,
        )
        self.workflow_handoff_index[
            f"{int(workflow_id)}:{int(ordinal)}"
        ] = handoff_id
        self.latest_handoff_by_workflow[workflow_id] = handoff_id
        return handoff_id

    @gl.public.write
    def submit_handoff_delivery(
        self, handoff_id: u256, delivery_uri: str, delivery_sha256: str
    ) -> None:
        self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        workflow = self.workflows[handoff.workflow_id]
        if workflow.status != WORKFLOW_ACTIVE:
            _fail("Delivery requires an active workflow")
        if gl.message.sender_address != handoff.provider:
            _fail("Only the handoff provider can submit delivery")
        if not handoff.active or int(handoff.delivery_accepted_at) > 0:
            _fail("Handoff is already terminal")
        if handoff_id in self.handoff_case_id:
            _fail("Cannot submit delivery after a dispute case exists")
        if int(_now()) > int(handoff.recovery_deadline):
            _fail("Handoff recovery deadline has expired")
        if int(handoff.delivery_version) > 0:
            _fail("Handoff delivery is already submitted")

        delivery_uri = _bounded_text(delivery_uri, "Delivery URI", MAX_URI_CHARS)
        if not delivery_uri.startswith("https://"):
            _fail("Delivery URI must use HTTPS")
        delivery_sha256 = delivery_sha256.strip().lower()
        if not _is_lower_hex_64(delivery_sha256):
            _fail("Delivery SHA-256 must be 64 lowercase hexadecimal characters")

        version = u256(1)
        submitted_at = _now()
        self.deliveries[self._delivery_storage_key(handoff_id, version)] = DeliveryRecord(
            handoff_id=handoff_id,
            version=version,
            provider=gl.message.sender_address,
            delivery_uri=delivery_uri,
            delivery_sha256=delivery_sha256,
            submitted_at=submitted_at,
            created_at=gl.message_raw["datetime"],
        )
        handoff.delivery_version = version
        handoff.delivery_uri = delivery_uri
        handoff.delivery_sha256 = delivery_sha256
        handoff.delivery_submitted_at = submitted_at

    @gl.public.write
    def accept_handoff_delivery(self, handoff_id: u256) -> None:
        self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        workflow = self.workflows[handoff.workflow_id]
        if workflow.status != WORKFLOW_ACTIVE:
            _fail("Delivery acceptance requires an active workflow")
        if gl.message.sender_address != handoff.requester:
            _fail("Only the handoff requester can accept delivery")
        if not handoff.active or int(handoff.delivery_accepted_at) > 0:
            _fail("Handoff is already terminal")
        if handoff.delivery_uri == "" or handoff.delivery_sha256 == "":
            _fail("Handoff has no submitted delivery")
        if handoff_id in self.handoff_case_id:
            _fail("Disputed handoff cannot be accepted directly")
        if int(_now()) > int(handoff.recovery_deadline):
            _fail("Handoff recovery deadline has expired")

        if self.vault_address != ZERO_ADDRESS:
            vault_status = VerdictGraphVault(self.vault_address).view().handoff_status(
                handoff_id
            )
            if int(vault_status) != 3:
                _fail("Vault escrow must be active before accepting delivery")

        policy = self.policies[workflow.policy_id]
        handoff.delivery_accepted_at = _now()
        handoff.completion_queued = True
        handoff.active = False

        if self.vault_address != ZERO_ADDRESS:
            handoff.completion_attempt_count = u256(1)
            handoff.completion_last_attempt_at = _now()
            VerdictGraphVault(self.vault_address).emit().apply_handoff_completion(
                handoff.workflow_id,
                handoff_id,
                policy.fingerprint_sha256,
                handoff.delivery_sha256,
            )

    @gl.public.write
    def retry_handoff_completion(self, handoff_id: u256) -> None:
        self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        self._require_handoff_participant(handoff)
        if not handoff.completion_queued or int(handoff.delivery_accepted_at) <= 0:
            _fail("Handoff completion has not been queued")
        if self.vault_address == ZERO_ADDRESS:
            _fail("Vault is not bound")
        if int(_now()) > int(handoff.recovery_deadline):
            _fail("Handoff recovery deadline has expired")

        vault_status = VerdictGraphVault(self.vault_address).view().handoff_status(
            handoff_id
        )
        if int(vault_status) != 3:
            _fail("Vault escrow is no longer active")

        workflow = self.workflows[handoff.workflow_id]
        policy = self.policies[workflow.policy_id]
        handoff.completion_attempt_count = u256(
            int(handoff.completion_attempt_count) + 1
        )
        handoff.completion_last_attempt_at = _now()
        VerdictGraphVault(self.vault_address).emit().apply_handoff_completion(
            handoff.workflow_id,
            handoff_id,
            policy.fingerprint_sha256,
            handoff.delivery_sha256,
        )

    @gl.public.write
    def sync_handoff_vault_status(self, handoff_id: u256) -> u256:
        self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        self._require_handoff_participant(handoff)
        if not handoff.completion_queued:
            _fail("Handoff completion has not been queued")
        if self.vault_address == ZERO_ADDRESS:
            _fail("Vault is not bound")
        vault_status = VerdictGraphVault(self.vault_address).view().handoff_status(
            handoff_id
        )
        if int(vault_status) not in (4, 5):
            _fail("Vault escrow is not terminal")
        handoff.vault_terminal_status = vault_status
        return vault_status

    @gl.public.write
    def add_handoff_dependency(
        self, handoff_id: u256, depends_on_handoff_id: u256
    ) -> None:
        self._require_handoff(handoff_id)
        self._require_handoff(depends_on_handoff_id)
        handoff = self.handoffs[handoff_id]
        dependency = self.handoffs[depends_on_handoff_id]
        workflow = self.workflows[handoff.workflow_id]
        if gl.message.sender_address != workflow.owner:
            _fail("Only the workflow owner can add dependencies")
        if workflow.status != WORKFLOW_DRAFT:
            _fail("Dependencies can only be added to a draft workflow")
        if dependency.workflow_id != handoff.workflow_id:
            _fail("Dependency must belong to the same workflow")
        if int(handoff.dependency_count) >= MAX_DEPENDENCIES_PER_HANDOFF:
            _fail("Handoff dependency limit reached")
        if int(dependency.ordinal) >= int(handoff.ordinal):
            _fail("Dependencies must point from an earlier handoff to a later handoff")

        seen_key = f"{int(handoff_id)}:{int(depends_on_handoff_id)}"
        if seen_key in self.handoff_dependency_seen:
            _fail("Handoff dependency already exists")
        index_key = f"{int(handoff_id)}:{int(handoff.dependency_count)}"
        self.handoff_dependency_index[index_key] = depends_on_handoff_id
        self.handoff_dependency_seen[seen_key] = True
        handoff.dependency_count = u256(int(handoff.dependency_count) + 1)

    @gl.public.write
    def activate_workflow(self, workflow_id: u256) -> None:
        self._require_workflow(workflow_id)
        workflow = self.workflows[workflow_id]
        if gl.message.sender_address != workflow.owner:
            _fail("Only the workflow owner can activate it")
        if workflow.status != WORKFLOW_DRAFT:
            _fail("Workflow is not a draft")
        if int(workflow.handoff_count) <= 0:
            _fail("Workflow requires at least one handoff")
        workflow.status = WORKFLOW_ACTIVE

    @gl.public.write
    def register_handoff_in_vault(self, handoff_id: u256) -> None:
        self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        workflow = self.workflows[handoff.workflow_id]
        if workflow.status != WORKFLOW_ACTIVE:
            _fail("Vault registration requires an active workflow")
        if gl.message.sender_address != workflow.owner:
            _fail("Only the workflow owner can register escrow terms")
        if self.vault_address == ZERO_ADDRESS:
            _fail("Vault is not bound")

        # EVM external messages are executed only on finality. The EVM Vault
        # accepts this registration only from this Core contract's ghost address.
        policy = self.policies[workflow.policy_id]
        VerdictGraphVault(self.vault_address).emit().register_handoff(
            handoff.workflow_id,
            handoff_id,
            policy.fingerprint_sha256,
            handoff.requester,
            handoff.provider,
            handoff.principal_required,
            handoff.provider_bond_required,
            handoff.funding_deadline,
            handoff.recovery_deadline,
        )

    @gl.public.write
    def close_workflow(self, workflow_id: u256) -> None:
        self._require_workflow(workflow_id)
        workflow = self.workflows[workflow_id]
        if gl.message.sender_address != workflow.owner:
            _fail("Only the workflow owner can close it")
        if workflow.status != WORKFLOW_ACTIVE:
            _fail("Only an active workflow can be closed")
        if int(_now()) <= int(workflow.deadline):
            _fail("Workflow cannot close before its deadline")
        workflow.status = WORKFLOW_CLOSED

    @gl.public.view
    def get_handoff_dependency(self, handoff_id: u256, index: u256) -> u256:
        self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        if int(index) >= int(handoff.dependency_count):
            _fail("Dependency index out of bounds")
        return self.handoff_dependency_index[f"{int(handoff_id)}:{int(index)}"]

    @gl.public.view
    def get_owner(self) -> Address:
        return self.owner

    @gl.public.view
    def get_vault_address(self) -> Address:
        return self.vault_address

    @gl.public.view
    def get_latest_policy_for_owner(self, owner_address: str) -> u256:
        owner = Address(owner_address)
        if owner not in self.latest_policy_by_owner:
            return u256(0)
        return self.latest_policy_by_owner[owner]

    @gl.public.view
    def get_latest_workflow_for_owner(self, owner_address: str) -> u256:
        owner = Address(owner_address)
        if owner not in self.latest_workflow_by_owner:
            return u256(0)
        return self.latest_workflow_by_owner[owner]

    @gl.public.view
    def get_latest_handoff_for_workflow(self, workflow_id: u256) -> u256:
        self._require_workflow(workflow_id)
        if workflow_id not in self.latest_handoff_by_workflow:
            return u256(0)
        return self.latest_handoff_by_workflow[workflow_id]

    @gl.public.view
    def get_latest_case_for_opener(self, opener_address: str) -> u256:
        opener = Address(opener_address)
        if opener not in self.latest_case_by_opener:
            return u256(0)
        return self.latest_case_by_opener[opener]

    @gl.public.view
    def get_policy_count(self) -> u256:
        return u256(int(self.next_policy_id) - 1)

    @gl.public.view
    def get_workflow_count(self) -> u256:
        return u256(int(self.next_workflow_id) - 1)

    @gl.public.view
    def get_handoff_count(self) -> u256:
        return u256(int(self.next_handoff_id) - 1)

    @gl.public.view
    def get_workflow_handoff(self, workflow_id: u256, index: u256) -> u256:
        self._require_workflow(workflow_id)
        workflow = self.workflows[workflow_id]
        if int(index) >= int(workflow.handoff_count):
            _fail("Workflow handoff index out of bounds")
        return self.workflow_handoff_index[f"{int(workflow_id)}:{int(index)}"]

    @gl.public.view
    def get_handoff_case_id(self, handoff_id: u256) -> u256:
        self._require_handoff(handoff_id)
        return self.handoff_case_id.get(handoff_id, u256(0))

    @gl.public.view
    def get_policy(self, policy_id: u256) -> EvidencePolicy:
        self._require_policy(policy_id)
        return self.policies[policy_id]

    @gl.public.view
    def get_workflow(self, workflow_id: u256) -> Workflow:
        self._require_workflow(workflow_id)
        return self.workflows[workflow_id]

    @gl.public.view
    def get_delivery(self, handoff_id: u256, version: u256) -> DeliveryRecord:
        self._require_handoff(handoff_id)
        key = self._delivery_storage_key(handoff_id, version)
        if key not in self.deliveries:
            _fail("Unknown handoff delivery version")
        return self.deliveries[key]

    @gl.public.view
    def get_handoff(self, handoff_id: u256) -> Handoff:
        self._require_handoff(handoff_id)
        return self.handoffs[handoff_id]


    @gl.public.write
    def repair_handoff_delivery(self, case_id: u256, delivery_uri: str, delivery_sha256: str) -> u256:
        if case_id not in self.case_context_json: _fail("Unknown case")
        if self.adjudicator_address == ZERO_ADDRESS: _fail("Adjudicator is not bound")
        context = json.loads(self.case_context_json[case_id]); handoff_id = u256(int(context["handoff_id"])); self._require_handoff(handoff_id)
        handoff = self.handoffs[handoff_id]
        if gl.message.sender_address != handoff.provider: _fail("Only the handoff provider can repair delivery")
        try: repair = json.loads(VerdictGraphAdjudicator(self.adjudicator_address).view().get_case_repair_snapshot(case_id))
        except Exception: _fail("Adjudicator repair state is unavailable")
        if repair.get("status") != CASE_REPAIR_REQUIRED: _fail("Delivery repair requires a repairable case state")
        if bool(repair.get("settlement_queued")): _fail("Handoff is not repairable")
        if int(_now()) > int(repair.get("recovery_deadline", 0)): _fail("Case recovery deadline has expired")
        if not str(repair.get("failure_code", "")).startswith("DELIVERY_"): _fail("Current repair finding does not concern delivery")
        delivery_uri = _bounded_text(delivery_uri, "Delivery URI", MAX_URI_CHARS)
        if not delivery_uri.startswith("https://"): _fail("Delivery URI must use HTTPS")
        delivery_sha256 = delivery_sha256.strip().lower()
        if not _is_lower_hex_64(delivery_sha256): _fail("Delivery SHA-256 must be 64 lowercase hexadecimal characters")
        version = u256(int(handoff.delivery_version)+1); submitted_at = _now()
        self.deliveries[self._delivery_storage_key(handoff_id, version)] = DeliveryRecord(handoff_id=handoff_id, version=version, provider=gl.message.sender_address, delivery_uri=delivery_uri, delivery_sha256=delivery_sha256, submitted_at=submitted_at, created_at=gl.message_raw["datetime"])
        handoff.delivery_version=version; handoff.delivery_uri=delivery_uri; handoff.delivery_sha256=delivery_sha256; handoff.delivery_submitted_at=submitted_at
        return version

    @gl.public.write
    def open_case(self, workflow_id: u256, handoff_id: u256, claim: str) -> u256:
        self._require_workflow(workflow_id); self._require_handoff(handoff_id)
        if self.adjudicator_address == ZERO_ADDRESS: _fail("Adjudicator is not bound")
        workflow=self.workflows[workflow_id]; handoff=self.handoffs[handoff_id]
        if workflow.status != WORKFLOW_ACTIVE: _fail("Cases can only be opened for active workflows")
        if handoff.workflow_id != workflow_id: _fail("Handoff does not belong to workflow")
        if not handoff.active or int(handoff.delivery_accepted_at)>0: _fail("Completed handoff cannot be disputed")
        if gl.message.sender_address not in (workflow.owner,handoff.requester,handoff.provider): _fail("Only the workflow owner or handoff participants can open a case")
        if handoff_id in self.handoff_case_id: _fail("Handoff already has a dispute case")
        if self.vault_address != ZERO_ADDRESS and int(VerdictGraphVault(self.vault_address).view().handoff_status(handoff_id)) != 3: _fail("Vault escrow must be active before opening a case")
        policy=self.policies[workflow.policy_id]; now=_now(); recovery_deadline=u256(int(now)+int(policy.review_recovery_seconds))
        if int(recovery_deadline)>int(handoff.recovery_deadline): _fail("Handoff does not have enough remaining recovery horizon")
        case_id=self.next_case_id; self.next_case_id=u256(int(case_id)+1); bounded_claim=_bounded_text(claim,"Case claim",MAX_TEXT_CHARS)
        context={"case_id":int(case_id),"workflow_id":int(workflow_id),"handoff_id":int(handoff_id),"opener":gl.message.sender_address.as_hex,"claim":bounded_claim,"policy_id":int(workflow.policy_id),"policy_fingerprint_sha256":policy.fingerprint_sha256,"max_evidence_age_seconds":int(policy.max_evidence_age_seconds),"minimum_remaining_validity_seconds":int(policy.minimum_remaining_validity_seconds),"minimum_distinct_issuers":int(policy.minimum_distinct_issuers),"minimum_distinct_publishers":int(policy.minimum_distinct_publishers),"response_window_seconds":int(policy.response_window_seconds),"repair_window_seconds":int(policy.repair_window_seconds),"review_recovery_seconds":int(policy.review_recovery_seconds),"workflow_title":workflow.title,"workflow_mission":workflow.mission,"requester":handoff.requester.as_hex,"provider":handoff.provider.as_hex,"responsibility":handoff.responsibility,"criteria_json":handoff.criteria_json,"handoff_deadline":int(handoff.deadline),"handoff_recovery_deadline":int(handoff.recovery_deadline),"response_deadline":int(now)+int(policy.response_window_seconds),"recovery_deadline":int(recovery_deadline),"opened_at":gl.message_raw["datetime"]}
        self.case_context_json[case_id]=_canonical_json(context); self.handoff_case_id[handoff_id]=case_id; self.latest_case_by_opener[gl.message.sender_address]=case_id
        VerdictGraphAdjudicator(self.adjudicator_address).emit().initialize_case(case_id)
        return case_id

    @gl.public.write
    def retry_case_initialization(self, case_id: u256) -> None:
        if case_id not in self.case_context_json: _fail("Unknown case")
        if self.adjudicator_address == ZERO_ADDRESS: _fail("Adjudicator is not bound")
        try: context=json.loads(self.case_context_json[case_id])
        except Exception: _fail("Stored case context is invalid")
        if not isinstance(context,dict): _fail("Stored case context is invalid")
        allowed=(Address(str(context["opener"])),Address(str(context["requester"])),Address(str(context["provider"])))
        if gl.message.sender_address not in allowed: _fail("Only a case participant can retry initialization")
        if int(_now()) > int(context["recovery_deadline"]): _fail("Case recovery deadline has expired")
        VerdictGraphAdjudicator(self.adjudicator_address).emit().initialize_case(case_id)

    @gl.public.write
    def sync_disputed_handoff_vault_status(self, handoff_id: u256) -> u256:
        self._require_handoff(handoff_id)
        handoff=self.handoffs[handoff_id]; self._require_handoff_participant(handoff)
        if handoff_id not in self.handoff_case_id: _fail("Handoff has no dispute case")
        if self.vault_address == ZERO_ADDRESS: _fail("Vault is not bound")
        vault_status=VerdictGraphVault(self.vault_address).view().handoff_status(handoff_id)
        if int(vault_status) not in (4,5): _fail("Vault escrow is not terminal")
        handoff.vault_terminal_status=vault_status; handoff.active=False
        return vault_status

    @gl.public.view
    def get_case_context(self, case_id: u256) -> str:
        if case_id not in self.case_context_json: _fail("Unknown case")
        return self.case_context_json[case_id]
    @gl.public.view
    def is_policy_issuer(self, policy_id: u256, issuer: Address) -> bool: return _policy_key(policy_id,"issuer:"+_address_key(issuer)) in self.policy_issuers
    @gl.public.view
    def is_policy_publisher(self, policy_id: u256, publisher_prefix: str) -> bool: return _policy_key(policy_id,"publisher:"+publisher_prefix) in self.policy_publishers
    @gl.public.view
    def get_delivery_snapshot(self, handoff_id: u256) -> str:
        self._require_handoff(handoff_id); h=self.handoffs[handoff_id]
        return _canonical_json({"handoff_id":int(handoff_id),"version":int(h.delivery_version),"uri":h.delivery_uri,"sha256":h.delivery_sha256,"submitted_at":int(h.delivery_submitted_at),"deadline":int(h.deadline)})
    @gl.public.view
    def get_adjudicator_address(self) -> str: return self.adjudicator_address.as_hex
