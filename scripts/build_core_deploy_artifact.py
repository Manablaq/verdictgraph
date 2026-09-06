#!/usr/bin/env python3
"""Build the Bradbury deployment form of VerdictGraph Core without changing behavior.

The canonical reviewer source remains contracts/verdict_graph_core.py. Bradbury stores
Intelligent Contract source code on-chain, so comments/docstrings/formatting consume
pubdata. This generator removes only non-executable docstrings/comments and compacts
formatting. It refuses to emit an artifact unless the executable Python AST is exactly
identical to the canonical source after docstrings are removed.
"""

from __future__ import annotations

import ast
import copy
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "contracts/verdict_graph_core.py"
DEPLOY = ROOT / "contracts/verdict_graph_core_deploy.py"
DEPENDS = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
MAX_DEPLOY_BYTES = 72_000


class StripDocstrings(ast.NodeTransformer):
    @staticmethod
    def _strip(node):
        body = getattr(node, "body", None)
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            node.body = body[1:]
        return node

    def visit_Module(self, node):
        self.generic_visit(node)
        return self._strip(node)

    def visit_ClassDef(self, node):
        self.generic_visit(node)
        return self._strip(node)

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        return self._strip(node)

    def visit_AsyncFunctionDef(self, node):
        self.generic_visit(node)
        return self._strip(node)


def executable_tree(source: str) -> ast.AST:
    tree = ast.parse(source)
    tree = StripDocstrings().visit(tree)
    ast.fix_missing_locations(tree)
    return tree


def dump(tree: ast.AST) -> str:
    return ast.dump(tree, include_attributes=False)


def compact_indentation(source: str) -> str:
    lines: list[str] = []
    for line in source.splitlines():
        spaces = len(line) - len(line.lstrip(" "))
        if spaces % 4 == 0:
            line = "\t" * (spaces // 4) + line[spaces:]
        lines.append(line.rstrip())
    return "\n".join(lines) + "\n"


def collapse_single_statement_suites(source: str, expected_dump: str) -> str:
    """Safely inline a suite only when exact AST equality proves no behavior change."""
    text = source
    changed = True
    while changed:
        changed = False
        lines = text.splitlines()
        out: list[str] = []
        index = 0
        while index < len(lines):
            line = lines[index]
            indent = len(line) - len(line.lstrip("\t"))
            stripped = line.lstrip("\t")
            if index + 1 < len(lines) and stripped.endswith(":"):
                child = lines[index + 1]
                child_indent = len(child) - len(child.lstrip("\t"))
                child_text = child.lstrip("\t")
                after = index + 2
                child_is_only_statement = (
                    after >= len(lines)
                    or len(lines[after]) - len(lines[after].lstrip("\t")) <= indent
                )
                if (
                    child_indent == indent + 1
                    and child_is_only_statement
                    and child_text
                    and not child_text.endswith(":")
                    and not child_text.startswith("@")
                ):
                    candidate_lines = out + [line + child_text] + lines[index + 2 :]
                    candidate = "\n".join(candidate_lines) + "\n"
                    try:
                        if dump(ast.parse(candidate)) == expected_dump:
                            out.append(line + child_text)
                            index += 2
                            changed = True
                            continue
                    except SyntaxError:
                        pass
            out.append(line)
            index += 1
        text = "\n".join(out) + "\n"
    return text


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    canonical = CANONICAL.read_text()
    tree = executable_tree(canonical)
    expected = dump(tree)

    body = ast.unparse(copy.deepcopy(tree)) + "\n"
    body = compact_indentation(body)
    body = collapse_single_statement_suites(body, expected)
    deploy_source = DEPENDS + body

    # Comments do not enter the AST, so the deploy source must still match exactly.
    actual = dump(ast.parse(deploy_source))
    if actual != expected:
        raise SystemExit("STOP: generated deployment artifact is not AST-equivalent to canonical Core")

    data = deploy_source.encode("utf-8")
    if len(data) > MAX_DEPLOY_BYTES:
        raise SystemExit(
            f"STOP: compact Core is {len(data)} bytes, above hard deployment budget {MAX_DEPLOY_BYTES}"
        )

    DEPLOY.write_bytes(data)
    canonical_bytes = CANONICAL.read_bytes()
    reduction_bps = 10_000 - (len(data) * 10_000 // len(canonical_bytes))
    print(f"CANONICAL_BYTES={len(canonical_bytes)}")
    print(f"DEPLOY_BYTES={len(data)}")
    print(f"REDUCTION_BPS={reduction_bps}")
    print(f"CANONICAL_SHA256={sha256(canonical_bytes)}")
    print(f"DEPLOY_SHA256={sha256(data)}")
    print("PASS deployment Core executable AST is identical to canonical Core")


if __name__ == "__main__":
    main()
