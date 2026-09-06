#!/usr/bin/env python3
"""Build progressively smaller Bradbury deployment forms of VerdictGraph Core.

The canonical reviewer source remains contracts/verdict_graph_core.py. Candidates are
produced deterministically and verified against increasingly explicit parity models:

1. exact_ast: executable AST is identical after docstring removal;
2. diagnostic_compact: only _fail() payloads and _bounded_text() diagnostic labels differ;
3. private_symbol_compact: additionally renames module-private constants/helpers and
   VerdictGraphCore private methods, with a reversible AST proof.

No public method name/argument, storage field, adjudication prompt, policy/status/
failure-code string, evidence key, or Vault interface field is renamed.
"""

from __future__ import annotations

import ast
import copy
import hashlib
import io
import json
import keyword
from pathlib import Path
import re
import tokenize

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "contracts/verdict_graph_core.py"
OUT_DIR = ROOT / "artifacts/stage4d-core-candidates"
DEPENDS = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'


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


class CompactDiagnostics(ast.NodeTransformer):
    """Compact only exception prose; control flow and persistent failure codes stay intact."""

    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id == "_fail" and node.args:
            node.args[0] = ast.Constant("!")
        if isinstance(node.func, ast.Name) and node.func.id == "_bounded_text" and len(node.args) >= 2:
            node.args[1] = ast.Constant("")
        return node


def executable_tree(source: str) -> ast.AST:
    tree = StripDocstrings().visit(ast.parse(source))
    ast.fix_missing_locations(tree)
    return tree


def ast_dump(tree: ast.AST) -> str:
    return ast.dump(tree, include_attributes=False)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_public(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    return any("gl.public" in ast.unparse(dec) for dec in fn.decorator_list)


def public_surface(tree: ast.AST):
    result = []
    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.ClassDef) or node.name != "VerdictGraphCore":
            continue
        for fn in node.body:
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) or not is_public(fn):
                continue
            args = []
            for arg in fn.args.posonlyargs + fn.args.args + fn.args.kwonlyargs:
                args.append(
                    (
                        arg.arg,
                        ast_dump(arg.annotation) if arg.annotation is not None else None,
                    )
                )
            result.append(
                (
                    fn.name,
                    tuple(args),
                    ast_dump(fn.returns) if fn.returns is not None else None,
                    tuple(ast.unparse(dec) for dec in fn.decorator_list),
                )
            )
    return tuple(result)


def storage_surface(tree: ast.AST):
    result = []
    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.ClassDef):
            continue
        is_storage = node.name == "VerdictGraphCore" or any(
            "allow_storage" in ast.unparse(dec) for dec in node.decorator_list
        )
        if not is_storage:
            continue
        fields = []
        for statement in node.body:
            if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
                fields.append((statement.target.id, ast_dump(statement.annotation)))
        result.append((node.name, tuple(fields)))
    return tuple(result)


def compact_indentation(source: str) -> str:
    lines = []
    for line in source.splitlines():
        spaces = len(line) - len(line.lstrip(" "))
        if spaces % 4 == 0:
            line = "\t" * (spaces // 4) + line[spaces:]
        lines.append(line.rstrip())
    return "\n".join(lines) + "\n"


def lexical_minify_line(line: str) -> str:
    prefix_len = len(line) - len(line.lstrip(" \t"))
    prefix = line[:prefix_len]
    body = line[prefix_len:]
    if not body:
        return ""
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(body + "\n").readline))
    except (tokenize.TokenError, IndentationError):
        return line.rstrip()

    # Python 3.13 tokenizes f-strings into semantic middle tokens that do not
    # retain doubled literal braces. Leave those lines untouched. Python 3.12
    # represents the full f-string as STRING and can safely use the normal path.
    fstring_types = {
        value
        for value in (
            getattr(tokenize, "FSTRING_START", None),
            getattr(tokenize, "FSTRING_MIDDLE", None),
            getattr(tokenize, "FSTRING_END", None),
        )
        if value is not None
    }
    if fstring_types and any(token.type in fstring_types for token in tokens):
        return line.rstrip()

    ignored = {
        tokenize.ENDMARKER,
        tokenize.NEWLINE,
        tokenize.NL,
        tokenize.INDENT,
        tokenize.DEDENT,
        tokenize.COMMENT,
    }
    word_types = {tokenize.NAME, tokenize.NUMBER, tokenize.STRING}
    out = ""
    previous = None
    for token in tokens:
        if token.type in ignored:
            continue
        text = token.string
        need_space = False
        if previous is not None:
            previous_type, previous_text = previous
            if previous_type in word_types and token.type in word_types:
                need_space = True
            if previous_type == tokenize.NUMBER and text.startswith("."):
                need_space = True
            if previous_text.endswith(".") and token.type == tokenize.NUMBER:
                need_space = True
        out += (" " if need_space else "") + text
        previous = (token.type, text)
    return prefix + out


def lexical_minify(source: str, expected_dump: str) -> str:
    candidate = "\n".join(
        lexical_minify_line(line) for line in source.splitlines() if line.strip()
    ) + "\n"
    if ast_dump(ast.parse(candidate)) != expected_dump:
        raise SystemExit("STOP: lexical compaction changed executable AST")
    return candidate


def pack_same_indent_statements(source: str, expected_dump: str) -> str:
    """Pack adjacent simple statements only when whole-file AST equality proves safety."""
    lines = source.splitlines()
    index = 0
    while index < len(lines) - 1:
        left = lines[index]
        right = lines[index + 1]
        left_prefix = re.match(r"^[\t ]*", left).group(0)
        right_prefix = re.match(r"^[\t ]*", right).group(0)
        if left_prefix and left_prefix == right_prefix:
            merged = left + ";" + right[len(right_prefix) :]
            trial_lines = lines[:index] + [merged] + lines[index + 2 :]
            trial = "\n".join(trial_lines) + "\n"
            try:
                if ast_dump(ast.parse(trial)) == expected_dump:
                    lines = trial_lines
                    continue
            except SyntaxError:
                pass
        index += 1
    result = "\n".join(lines) + "\n"
    if ast_dump(ast.parse(result)) != expected_dump:
        raise SystemExit("STOP: statement packing changed executable AST")
    return result


def compact_render(tree: ast.AST) -> str:
    expected = ast_dump(tree)
    source = DEPENDS + ast.unparse(copy.deepcopy(tree)) + "\n"
    source = compact_indentation(source)
    source = lexical_minify(source, expected)
    return source


def module_bindings(tree: ast.AST) -> set[str]:
    result: set[str] = set()
    for node in getattr(tree, "body", []):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            result.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    result.add(target.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            result.add(node.target.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                result.add(alias.asname or alias.name.split(".")[0])
    return result


def internal_symbol_maps(tree: ast.AST):
    bindings = module_bindings(tree)
    globals_to_shorten = sorted(
        (
            name
            for name in bindings
            if (name.startswith("_") and not name.startswith("__")) or name.isupper()
        ),
        key=lambda value: (-len(value), value),
    )
    global_map = {name: f"G{index}" for index, name in enumerate(globals_to_shorten)}

    core = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "VerdictGraphCore"
    )
    private_methods = sorted(
        (
            fn.name
            for fn in core.body
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef))
            and fn.name.startswith("_")
            and not fn.name.startswith("__")
        ),
        key=lambda value: (-len(value), value),
    )
    method_map = {name: f"m{index}" for index, name in enumerate(private_methods)}

    all_names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    all_attrs = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
    collisions = (set(global_map.values()) & all_names) | (set(method_map.values()) & all_attrs)
    if collisions:
        raise SystemExit(f"STOP: private symbol compaction collision: {sorted(collisions)}")
    if any(keyword.iskeyword(value) for value in set(global_map.values()) | set(method_map.values())):
        raise SystemExit("STOP: generated private symbol is a Python keyword")
    return global_map, method_map


class RenameInternalSymbols(ast.NodeTransformer):
    def __init__(self, global_map: dict[str, str], method_map: dict[str, str]):
        self.global_map = global_map
        self.method_map = method_map
        self.class_stack: list[str] = []

    def visit_Name(self, node):
        node.id = self.global_map.get(node.id, node.id)
        return node

    def visit_Attribute(self, node):
        self.generic_visit(node)
        node.attr = self.method_map.get(node.attr, node.attr)
        return node

    def visit_FunctionDef(self, node):
        if not self.class_stack:
            node.name = self.global_map.get(node.name, node.name)
        elif self.class_stack[-1] == "VerdictGraphCore":
            node.name = self.method_map.get(node.name, node.name)
        self.generic_visit(node)
        return node

    def visit_AsyncFunctionDef(self, node):
        return self.visit_FunctionDef(node)

    def visit_ClassDef(self, node):
        self.class_stack.append(node.name)
        self.generic_visit(node)
        self.class_stack.pop()
        return node


class ReverseInternalSymbols(ast.NodeTransformer):
    def __init__(self, global_map: dict[str, str], method_map: dict[str, str]):
        self.global_map = {value: key for key, value in global_map.items()}
        self.method_map = {value: key for key, value in method_map.items()}
        self.class_stack: list[str] = []

    def visit_Name(self, node):
        node.id = self.global_map.get(node.id, node.id)
        return node

    def visit_Attribute(self, node):
        self.generic_visit(node)
        node.attr = self.method_map.get(node.attr, node.attr)
        return node

    def visit_FunctionDef(self, node):
        if not self.class_stack:
            node.name = self.global_map.get(node.name, node.name)
        elif self.class_stack[-1] == "VerdictGraphCore":
            node.name = self.method_map.get(node.name, node.name)
        self.generic_visit(node)
        return node

    def visit_AsyncFunctionDef(self, node):
        return self.visit_FunctionDef(node)

    def visit_ClassDef(self, node):
        self.class_stack.append(node.name)
        self.generic_visit(node)
        self.class_stack.pop()
        return node


def verify_public_and_storage(candidate_tree: ast.AST, canonical_tree: ast.AST) -> None:
    if public_surface(candidate_tree) != public_surface(canonical_tree):
        raise SystemExit("STOP: deployment candidate changed public Core ABI")
    if storage_surface(candidate_tree) != storage_surface(canonical_tree):
        raise SystemExit("STOP: deployment candidate changed storage field surface")


def write_candidate(name: str, source: str, canonical_tree: ast.AST, proof: str) -> dict:
    path = OUT_DIR / f"{name}.py"
    path.write_text(source)
    parsed = ast.parse(source)
    verify_public_and_storage(parsed, canonical_tree)
    data = source.encode("utf-8")
    return {
        "name": name,
        "path": str(path.relative_to(ROOT)),
        "bytes": len(data),
        "sha256": sha256(data),
        "proof": proof,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    canonical_bytes = CANONICAL.read_bytes()
    canonical_source = canonical_bytes.decode("utf-8")
    canonical_tree = executable_tree(canonical_source)
    canonical_dump = ast_dump(canonical_tree)

    exact_source = compact_render(copy.deepcopy(canonical_tree))
    if ast_dump(ast.parse(exact_source)) != canonical_dump:
        raise SystemExit("STOP: exact candidate is not executable-AST identical")
    exact = write_candidate(
        "exact_ast",
        exact_source,
        canonical_tree,
        "executable AST identical after docstring removal",
    )

    diagnostic_tree = CompactDiagnostics().visit(copy.deepcopy(canonical_tree))
    ast.fix_missing_locations(diagnostic_tree)
    diagnostic_dump = ast_dump(diagnostic_tree)
    diagnostic_source = compact_render(copy.deepcopy(diagnostic_tree))
    if ast_dump(ast.parse(diagnostic_source)) != diagnostic_dump:
        raise SystemExit("STOP: diagnostic candidate changed non-diagnostic AST")
    diagnostic = write_candidate(
        "diagnostic_compact",
        diagnostic_source,
        canonical_tree,
        "only _fail payloads and _bounded_text labels compacted",
    )

    global_map, method_map = internal_symbol_maps(diagnostic_tree)
    private_tree = RenameInternalSymbols(global_map, method_map).visit(copy.deepcopy(diagnostic_tree))
    ast.fix_missing_locations(private_tree)
    private_source = compact_render(copy.deepcopy(private_tree))
    parsed_private = ast.parse(private_source)
    reversed_private = ReverseInternalSymbols(global_map, method_map).visit(copy.deepcopy(parsed_private))
    ast.fix_missing_locations(reversed_private)
    if ast_dump(reversed_private) != diagnostic_dump:
        raise SystemExit("STOP: private-symbol candidate failed reversible AST parity proof")
    private = write_candidate(
        "private_symbol_compact",
        private_source,
        canonical_tree,
        "diagnostic compaction plus reversible module-private/private-method renaming",
    )

    candidates = [exact, diagnostic, private]
    if not (exact["bytes"] > diagnostic["bytes"] > private["bytes"]):
        raise SystemExit("STOP: candidate size ordering is not strictly decreasing")
    if private["bytes"] >= 60_000:
        raise SystemExit(
            f"STOP: smallest candidate is {private['bytes']} bytes; expected a material sub-60KB recovery artifact"
        )

    manifest = {
        "schema": "verdictgraph-stage4d-core-candidates-v1",
        "canonical_path": str(CANONICAL.relative_to(ROOT)),
        "canonical_bytes": len(canonical_bytes),
        "canonical_sha256": sha256(canonical_bytes),
        "public_surface_sha256": sha256(repr(public_surface(canonical_tree)).encode()),
        "storage_surface_sha256": sha256(repr(storage_surface(canonical_tree)).encode()),
        "candidates": candidates,
        "private_symbol_map": {
            "module": global_map,
            "core_private_methods": method_map,
        },
    }
    manifest_path = OUT_DIR / "candidates.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    print(f"CANONICAL_BYTES={len(canonical_bytes)}")
    print(f"CANONICAL_SHA256={sha256(canonical_bytes)}")
    for candidate in candidates:
        reduction_bps = 10_000 - candidate["bytes"] * 10_000 // len(canonical_bytes)
        print(
            f"CANDIDATE={candidate['name']} BYTES={candidate['bytes']} "
            f"REDUCTION_BPS={reduction_bps} SHA256={candidate['sha256']}"
        )
    print("PASS Stage 4D candidate parity proofs")
    print(manifest_path)


if __name__ == "__main__":
    main()
