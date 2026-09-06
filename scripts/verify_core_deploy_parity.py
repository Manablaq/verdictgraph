#!/usr/bin/env python3
"""Verify the selected Bradbury Core deployment artifact against its parity model."""

from __future__ import annotations

import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "scripts/build_core_deploy_candidates.py"
CANONICAL = ROOT / "contracts/verdict_graph_core.py"
DEPLOY = ROOT / "contracts/verdict_graph_core_deploy.py"
CANDIDATES = ROOT / "artifacts/stage4d-core-candidates/candidates.json"

spec = importlib.util.spec_from_file_location("verdictgraph_stage4d_builder", BUILDER_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("STOP: unable to load Stage 4D candidate builder")
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if not DEPLOY.is_file() or not CANDIDATES.is_file():
        raise SystemExit("STOP: selected deploy artifact or Stage 4D candidate manifest is missing")

    manifest = json.loads(CANDIDATES.read_text())
    canonical_sha = digest(CANONICAL)
    if canonical_sha != manifest.get("canonical_sha256"):
        raise SystemExit("STOP: canonical Core changed after Stage 4D candidates were generated")

    deploy_bytes = DEPLOY.read_bytes()
    deploy_sha = hashlib.sha256(deploy_bytes).hexdigest()
    matched = next(
        (
            item
            for item in manifest.get("candidates", [])
            if item.get("sha256") == deploy_sha and int(item.get("bytes", -1)) == len(deploy_bytes)
        ),
        None,
    )
    if matched is None:
        raise SystemExit("STOP: selected deploy artifact is not one of the generated Stage 4D candidates")

    canonical_tree = builder.executable_tree(CANONICAL.read_text())
    deploy_tree = ast.parse(deploy_bytes.decode("utf-8"))
    builder.verify_public_and_storage(deploy_tree, canonical_tree)

    name = matched["name"]
    if name == "exact_ast":
        reference = canonical_tree
        candidate = deploy_tree
    else:
        reference = builder.CompactDiagnostics().visit(copy.deepcopy(canonical_tree))
        ast.fix_missing_locations(reference)
        if name == "diagnostic_compact":
            candidate = deploy_tree
        elif name == "private_symbol_compact":
            symbol_map = manifest.get("private_symbol_map", {})
            candidate = builder.ReverseInternalSymbols(
                symbol_map.get("module", {}),
                symbol_map.get("core_private_methods", {}),
            ).visit(copy.deepcopy(deploy_tree))
            ast.fix_missing_locations(candidate)
        else:
            raise SystemExit(f"STOP: unsupported Stage 4D candidate model: {name}")

    if builder.ast_dump(reference) != builder.ast_dump(candidate):
        raise SystemExit(f"STOP: {name} failed executable parity verification")

    print(f"SELECTED_CANDIDATE={name}")
    print(f"DEPLOY_BYTES={len(deploy_bytes)}")
    print(f"DEPLOY_SHA256={deploy_sha}")
    print("PASS selected Core public ABI matches canonical Core")
    print("PASS selected Core storage field surface matches canonical Core")
    if name == "exact_ast":
        print("PASS selected Core executable AST is identical to canonical Core")
    elif name == "diagnostic_compact":
        print("PASS selected Core differs only in non-persistent UserError diagnostic prose")
    else:
        print("PASS selected Core differs only in diagnostic prose plus reversibly renamed private symbols")


if __name__ == "__main__":
    main()
