# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""GenLayer-native authority registry for accepted project trust roots.

This contract is intentionally narrow: the funded acceptance authority writes
an immutable project snapshot once, while the milestone Registry consumes that
snapshot by view. Keeping provenance separate prevents milestone lifecycle
mutations from changing the accepted baseline or acceptance record.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from typing import NoReturn

from genlayer import *


ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")
MAX_PROJECT_REF_CHARS = 160
MAX_URI_CHARS = 768
MAX_HASH_CHARS = 64


def _fail(message: str) -> NoReturn:
    raise gl.vm.UserError(message)


def _canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _hash(value: str, label: str) -> str:
    value = value.strip()
    if len(value) != MAX_HASH_CHARS or not all(char in "0123456789abcdef" for char in value):
        _fail(f"{label} must be 64 lowercase hexadecimal characters")
    return value


def _bounded_text(value: str, label: str, maximum: int) -> str:
    value = value.strip()
    if not value or len(value) > maximum:
        _fail(f"{label} is empty or too long")
    return value


def _https_uri(value: str, label: str) -> str:
    value = _bounded_text(value, label, MAX_URI_CHARS)
    if not value.startswith("https://") or len(value) <= len("https://") or any(char.isspace() for char in value):
        _fail(f"{label} must use HTTPS")
    authority = value[len("https://") :].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    labels = authority.lower().split(".")
    if not authority or "@" in authority or ":" in authority or any(char in authority for char in "\\%<>"):
        _fail(f"{label} must use a public HTTPS origin")
    if len(labels) == 4 and all(part.isdigit() for part in labels) and all(0 <= int(part) <= 255 for part in labels):
        _fail(f"{label} must use a public HTTPS origin")
    if len(labels) < 2 or any(
        not part or part[0] == "-" or part[-1] == "-" or not all(char.isascii() and (char.isalnum() or char == "-") for char in part)
        for part in labels
    ):
        _fail(f"{label} must use a public HTTPS origin")
    if authority.lower() in ("localhost", "localhost.localdomain") or authority.lower().endswith(".local"):
        _fail(f"{label} must use a public HTTPS origin")
    return value


def _uri_origin(value: str) -> str:
    authority = value[len("https://") :].split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    return f"https://{authority.lower()}"


@allow_storage
@dataclass
class AcceptedProject:
    project_ref: str
    sponsor: Address
    baseline_uri: str
    baseline_sha256: str
    baseline_mirror_uri: str
    acceptance_record_uri: str
    acceptance_record_sha256: str
    acceptance_record_mirror_uri: str
    submission_origins_json: str
    registered_at: str


class VerdictGraphMilestoneAuthority(gl.Contract):
    owner: Address
    acceptance_authority: Address
    authority_source_sha256: str
    accepted_projects: TreeMap[str, AcceptedProject]
    project_count: u256

    def __init__(self, acceptance_authority_address: str, authority_source_sha256: str):
        self.owner = gl.message.sender_address
        self.acceptance_authority = Address(acceptance_authority_address)
        if self.acceptance_authority == ZERO_ADDRESS:
            _fail("Acceptance authority cannot be the zero address")
        self.authority_source_sha256 = _hash(authority_source_sha256, "Authority source SHA-256")
        self.project_count = u256(0)

    @gl.public.view
    def get_owner(self) -> Address:
        return self.owner

    @gl.public.view
    def get_acceptance_authority(self) -> Address:
        return self.acceptance_authority

    @gl.public.view
    def get_authority_source_sha256(self) -> str:
        return self.authority_source_sha256

    @gl.public.view
    def get_controller_source_sha256(self) -> str:
        return self.authority_source_sha256

    @gl.public.view
    def get_project_count(self) -> u256:
        return self.project_count

    @gl.public.write
    def register_accepted_project(
        self,
        project_ref: str,
        sponsor_address: str,
        baseline_uri: str,
        baseline_sha256: str,
        baseline_mirror_uri: str,
        acceptance_record_uri: str,
        acceptance_record_sha256: str,
        acceptance_record_mirror_uri: str,
    ) -> None:
        if gl.message.sender_address != self.acceptance_authority:
            _fail("Only the acceptance authority can register a project")
        project_ref = _bounded_text(project_ref, "Accepted project reference", MAX_PROJECT_REF_CHARS)
        if project_ref in self.accepted_projects:
            _fail("Accepted project reference is already registered")
        sponsor = Address(sponsor_address)
        if sponsor == ZERO_ADDRESS:
            _fail("Accepted project sponsor cannot be the zero address")
        baseline_uri = _https_uri(baseline_uri, "Accepted baseline URI")
        baseline_mirror_uri = _https_uri(baseline_mirror_uri, "Accepted baseline mirror URI")
        acceptance_record_uri = _https_uri(acceptance_record_uri, "Acceptance record URI")
        acceptance_record_mirror_uri = _https_uri(acceptance_record_mirror_uri, "Acceptance record mirror URI")
        if baseline_mirror_uri == baseline_uri:
            _fail("Accepted baseline mirror must be a distinct URI")
        if acceptance_record_mirror_uri == acceptance_record_uri:
            _fail("Acceptance record mirror must be a distinct URI")
        submission_origins_json = _canonical_json(sorted({
            _uri_origin(baseline_uri), _uri_origin(baseline_mirror_uri),
            _uri_origin(acceptance_record_uri), _uri_origin(acceptance_record_mirror_uri),
        }))
        self.accepted_projects[project_ref] = AcceptedProject(
            project_ref=project_ref,
            sponsor=sponsor,
            baseline_uri=baseline_uri,
            baseline_sha256=_hash(baseline_sha256, "Accepted baseline SHA-256"),
            baseline_mirror_uri=baseline_mirror_uri,
            acceptance_record_uri=acceptance_record_uri,
            acceptance_record_sha256=_hash(acceptance_record_sha256, "Acceptance record SHA-256"),
            acceptance_record_mirror_uri=acceptance_record_mirror_uri,
            submission_origins_json=submission_origins_json,
            registered_at=gl.message_raw["datetime"],
        )
        self.project_count = u256(int(self.project_count) + 1)

    @gl.public.view
    def get_accepted_project(self, project_ref: str) -> AcceptedProject:
        project_ref = _bounded_text(project_ref, "Accepted project reference", MAX_PROJECT_REF_CHARS)
        if project_ref not in self.accepted_projects:
            _fail("Unknown accepted project")
        return self.accepted_projects[project_ref]

    @gl.public.view
    def get_project_snapshot(self, project_ref: str) -> str:
        project = self.get_accepted_project(project_ref)
        return _canonical_json({
            "version": 1,
            "project_ref": project.project_ref,
            "sponsor": project.sponsor.as_hex,
            "baseline_uri": project.baseline_uri,
            "baseline_sha256": project.baseline_sha256,
            "baseline_mirror_uri": project.baseline_mirror_uri,
            "acceptance_record_uri": project.acceptance_record_uri,
            "acceptance_record_sha256": project.acceptance_record_sha256,
            "acceptance_record_mirror_uri": project.acceptance_record_mirror_uri,
            "submission_origins_json": project.submission_origins_json,
            "registered_at": project.registered_at,
        })
