#!/usr/bin/env python3
"""Build the Bradbury deployment forms of the milestone ICs.

Bradbury stores Intelligent Contract source in deployment calldata, so this
generator produces AST-proven transport artifacts without removing any public
method, storage field, criterion, evidence rule, review rule, consequence, or
recovery path from any canonical milestone IC.

The transformations are deliberately narrow:

* remove Python docstrings and comments;
* compact whitespace and safe single-statement suites;
* rename only module-private symbols and Controller-private methods.

The final artifact must pass a reversible AST proof and preserve the public and storage surfaces.
It is re-verified by GenVM and Direct Mode by the release gate before deployment.
"""

from __future__ import annotations

import ast
import copy
import hashlib
import io
import keyword
from pathlib import Path
import re
import tokenize

ROOT = Path(__file__).resolve().parents[1]
PAIRS = [
    (ROOT / "contracts/verdict_graph_milestone_authority.py", ROOT / "contracts/verdict_graph_milestone_authority_deploy.py", "VerdictGraphMilestoneAuthority"),
    (ROOT / "contracts/verdict_graph_milestone.py", ROOT / "contracts/verdict_graph_milestone_deploy.py", "VerdictGraphMilestone"),
    (ROOT / "contracts/verdict_graph_milestone_registry.py", ROOT / "contracts/verdict_graph_milestone_registry_deploy.py", "VerdictGraphMilestoneRegistry"),
    (ROOT / "contracts/verdict_graph_milestone_adjudicator.py", ROOT / "contracts/verdict_graph_milestone_adjudicator_deploy.py", "VerdictGraphMilestoneAdjudicator"),
]
DEPENDS = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'


class StripDocstrings(ast.NodeTransformer):
    @staticmethod
    def strip(node: ast.AST) -> ast.AST:
        body = getattr(node, "body", None)
        if (
            body
            and isinstance(body[0], ast.Expr)
            and isinstance(body[0].value, ast.Constant)
            and isinstance(body[0].value.value, str)
        ):
            node.body = body[1:]
        return node

    def visit_Module(self, node: ast.Module):
        self.generic_visit(node)
        return self.strip(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        self.generic_visit(node)
        return self.strip(node)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.generic_visit(node)
        return self.strip(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self.generic_visit(node)
        return self.strip(node)


def ast_dump(tree: ast.AST) -> str:
    return ast.dump(tree, include_attributes=False)


def executable_tree(source: str) -> ast.AST:
    tree = StripDocstrings().visit(ast.parse(source))
    ast.fix_missing_locations(tree)
    return tree


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compact_indentation(source: str) -> str:
    lines: list[str] = []
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
    if body.lstrip().startswith("#"):
        return line.rstrip()
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(body + "\n").readline))
    except (tokenize.TokenError, IndentationError):
        return line.rstrip()

    fstring_start = getattr(tokenize, "FSTRING_START", None)
    fstring_end = getattr(tokenize, "FSTRING_END", None)

    if (
        fstring_start is not None
        and fstring_end is not None
        and any(token.type == fstring_start for token in tokens)
    ):
        spans: list[tuple[int, int]] = []
        depth = 0
        span_start: int | None = None

        for token in tokens:
            if token.type == fstring_start:
                if depth == 0:
                    if token.start[0] != 1:
                        return line.rstrip()
                    span_start = token.start[1]
                depth += 1
                continue

            if token.type == fstring_end and depth:
                depth -= 1
                if depth == 0:
                    if span_start is None or token.end[0] != 1:
                        return line.rstrip()
                    spans.append((span_start, token.end[1]))
                    span_start = None

        if depth != 0 or not spans:
            return line.rstrip()

        protected = body
        replacements: list[tuple[str, str]] = []

        for index, (start, end) in reversed(list(enumerate(spans))):
            placeholder = f"'__VERDICTGRAPH_FSTRING_{index}__'"

            if placeholder in body:
                raise SystemExit(
                    "STOP: f-string placeholder collides with source"
                )

            literal = body[start:end]
            protected = (
                protected[:start]
                + placeholder
                + protected[end:]
            )
            replacements.append((placeholder, literal))

        result = lexical_minify_line(prefix + protected)

        for placeholder, literal in replacements:
            if result.count(placeholder) != 1:
                raise SystemExit(
                    "STOP: protected f-string placeholder count changed"
                )
            result = result.replace(placeholder, literal, 1)

        return result

    ignored = {
        tokenize.ENDMARKER,
        tokenize.NEWLINE,
        tokenize.NL,
        tokenize.INDENT,
        tokenize.DEDENT,
        tokenize.COMMENT,
    }
    word_types = {tokenize.NAME, tokenize.NUMBER, tokenize.STRING}
    output = ""
    previous: tuple[int, str] | None = None
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
        output += (" " if need_space else "") + text
        previous = (token.type, text)
    return prefix + output


def lexical_minify(source: str, expected_dump: str) -> str:
    candidate = (
        "\n".join(
            lexical_minify_line(line) for line in source.splitlines() if line.strip()
        )
        + "\n"
    )
    if ast_dump(ast.parse(candidate)) != expected_dump:
        raise SystemExit("STOP: lexical compaction changed executable AST")
    return candidate


def collapse_single_statement_suites(source: str, expected_dump: str) -> str:
    text = source
    changed = True
    while changed:
        changed = False
        lines = text.splitlines()
        output: list[str] = []
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
                    candidate = "\n".join(
                        output + [line + child_text] + lines[index + 2 :]
                    ) + "\n"
                    try:
                        if ast_dump(ast.parse(candidate)) == expected_dump:
                            output.append(line + child_text)
                            index += 2
                            changed = True
                            continue
                    except SyntaxError:
                        pass
            output.append(line)
            index += 1
        text = "\n".join(output) + "\n"
    return text


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
            trial = "\n".join(lines[:index] + [merged] + lines[index + 2 :]) + "\n"
            try:
                if ast_dump(ast.parse(trial)) == expected_dump:
                    lines[index] = merged
                    del lines[index + 1]
                    continue
            except SyntaxError:
                pass
        index += 1
    result = "\n".join(lines) + "\n"
    if ast_dump(ast.parse(result)) != expected_dump:
        raise SystemExit("STOP: statement packing changed executable AST")
    return result


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


def internal_symbol_maps(tree: ast.AST, contract_class_name: str) -> tuple[dict[str, str], dict[str, str]]:
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

    controller = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == contract_class_name
    )
    private_methods = sorted(
        (
            fn.name
            for fn in controller.body
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef))
            and fn.name.startswith("_")
            and not fn.name.startswith("__")
        ),
        key=lambda value: (-len(value), value),
    )
    method_map = {name: f"m{index}" for index, name in enumerate(private_methods)}

    all_names = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    all_attrs = {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)}
    collisions = (set(global_map.values()) & all_names) | (
        set(method_map.values()) & all_attrs
    )
    if collisions:
        raise SystemExit(f"STOP: private symbol compaction collision: {sorted(collisions)}")
    if any(keyword.iskeyword(value) for value in set(global_map.values()) | set(method_map.values())):
        raise SystemExit("STOP: generated private symbol is a Python keyword")
    return global_map, method_map


class RenameInternalSymbols(ast.NodeTransformer):
    def __init__(self, global_map: dict[str, str], method_map: dict[str, str], contract_class_name: str):
        self.global_map = global_map
        self.method_map = method_map
        self.contract_class_name = contract_class_name
        self.class_stack: list[str] = []

    def visit_Name(self, node: ast.Name):
        node.id = self.global_map.get(node.id, node.id)
        return node

    def visit_Attribute(self, node: ast.Attribute):
        self.generic_visit(node)
        node.attr = self.method_map.get(node.attr, node.attr)
        return node

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if not self.class_stack:
            node.name = self.global_map.get(node.name, node.name)
        elif self.class_stack[-1] == self.contract_class_name:
            node.name = self.method_map.get(node.name, node.name)
        self.generic_visit(node)
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        return self.visit_FunctionDef(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        self.class_stack.append(node.name)
        self.generic_visit(node)
        self.class_stack.pop()
        return node


class ReverseInternalSymbols(RenameInternalSymbols):
    def __init__(self, global_map: dict[str, str], method_map: dict[str, str], contract_class_name: str):
        super().__init__(
            {value: key for key, value in global_map.items()},
            {value: key for key, value in method_map.items()},
            contract_class_name,
        )


class LocalBindings(ast.NodeVisitor):
    def __init__(self):
        self.bound: set[str] = set()
        self.protected: set[str] = set()

    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            self.bound.add(node.id)

    def visit_arg(self, node: ast.arg):
        self.bound.add(node.arg)

    def visit_Global(self, node: ast.Global):
        self.protected.update(node.names)

    def visit_Nonlocal(self, node: ast.Nonlocal):
        self.protected.update(node.names)

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        if node.name:
            self.bound.add(node.name)
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self.bound.add(alias.asname or alias.name.split(".")[0])

    def visit_ImportFrom(self, node: ast.ImportFrom):
        for alias in node.names:
            if alias.name != "*":
                self.bound.add(alias.asname or alias.name)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.bound.add(node.name)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self.bound.add(node.name)

    def visit_ClassDef(self, node: ast.ClassDef):
        self.bound.add(node.name)

    def visit_Lambda(self, node: ast.Lambda):
        # A lambda has its own local scope; its arguments/body are handled when
        # the lambda is visited as a function, if one is ever introduced here.
        return


def function_is_public(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    return any("gl.public" in ast.unparse(dec) for dec in node.decorator_list)


def local_name_map(node: ast.FunctionDef | ast.AsyncFunctionDef) -> dict[str, str]:
    bindings = LocalBindings()
    for statement in node.body:
        bindings.visit(statement)
    protected = set(bindings.protected)
    nested_scope_names: set[str] = set()
    for child in ast.walk(node):
        if child is node or not isinstance(
            child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
        ):
            continue
        for nested in ast.walk(child):
            if isinstance(nested, ast.Name):
                nested_scope_names.add(nested.id)
            elif isinstance(nested, ast.arg):
                nested_scope_names.add(nested.arg)
    # A nested function/lambda closes over names from this function. Leave every
    # such spelling stable unless a full closure-aware rewrite is introduced.
    protected.update(nested_scope_names)
    if function_is_public(node) or node.name == "__init__":
        protected.update(
            argument.arg
            for argument in (
                node.args.posonlyargs
                + node.args.args
                + node.args.kwonlyargs
            )
        )
        if node.args.vararg:
            protected.add(node.args.vararg.arg)
        if node.args.kwarg:
            protected.add(node.args.kwarg.arg)

    used = {item.id for item in ast.walk(node) if isinstance(item, ast.Name)}
    used.update(nested_scope_names)
    used.update(
        item.name
        for item in ast.walk(node)
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    )
    candidates = list("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
    candidates.extend(f"v{index}" for index in range(1000))
    result: dict[str, str] = {}
    for name in sorted(bindings.bound - protected, key=lambda value: (-len(value), value)):
        for candidate in candidates:
            if candidate not in used and candidate not in result.values() and not keyword.iskeyword(candidate):
                result[name] = candidate
                used.add(candidate)
                break
    return result


class RenameLocalNames(ast.NodeTransformer):
    def __init__(self, *, reverse: bool = False, maps: list[dict[str, str]] | None = None):
        self.reverse = reverse
        self.maps = maps if maps is not None else []
        self.map_index = 0

    def visit_Name(self, node: ast.Name):
        node.id = self.current_map.get(node.id, node.id)
        return node

    def visit_ExceptHandler(self, node: ast.ExceptHandler):
        self.generic_visit(node)
        if node.name:
            node.name = self.current_map.get(node.name, node.name)
        return node

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            binding = alias.asname or alias.name.split(".")[0]
            mapped = self.current_map.get(binding, binding)
            if alias.asname:
                alias.asname = mapped
            elif mapped != binding:
                alias.asname = mapped
        return node

    def visit_ImportFrom(self, node: ast.ImportFrom):
        for alias in node.names:
            if alias.name == "*":
                continue
            binding = alias.asname or alias.name
            mapped = self.current_map.get(binding, binding)
            if alias.asname:
                alias.asname = mapped
            elif mapped != binding:
                alias.asname = mapped
        return node

    def visit_FunctionDef(self, node: ast.FunctionDef):
        node.name = self.current_map.get(node.name, node.name)
        return self.process_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        node.name = self.current_map.get(node.name, node.name)
        return self.process_function(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        node.name = self.current_map.get(node.name, node.name)
        for index, statement in enumerate(node.body):
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                node.body[index] = self.process_function(statement)
            elif isinstance(statement, ast.ClassDef):
                node.body[index] = self.visit_ClassDef(statement)
        return node

    def process_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef):
        if self.reverse:
            forward = self.maps[self.map_index]
            self.map_index += 1
            current = {value: key for key, value in forward.items()}
        else:
            current = local_name_map(node)
            self.maps.append(current)

        previous = getattr(self, "current_map", {})
        self.current_map = current
        for argument in (
            node.args.posonlyargs
            + node.args.args
            + node.args.kwonlyargs
        ):
            argument.arg = current.get(argument.arg, argument.arg)
        if node.args.vararg:
            node.args.vararg.arg = current.get(node.args.vararg.arg, node.args.vararg.arg)
        if node.args.kwarg:
            node.args.kwarg.arg = current.get(node.args.kwarg.arg, node.args.kwarg.arg)
        node.body = [self.visit(statement) for statement in node.body]
        self.current_map = previous
        return node


def apply_local_renames(tree: ast.AST, *, reverse: bool = False, maps=None):
    transformer = RenameLocalNames(reverse=reverse, maps=maps)
    for index, node in enumerate(getattr(tree, "body", [])):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            tree.body[index] = transformer.process_function(node)
        elif isinstance(node, ast.ClassDef):
            tree.body[index] = transformer.visit_ClassDef(node)
    if reverse and transformer.map_index != len(maps):
        raise SystemExit("STOP: local-symbol parity map did not cover the same function scopes")
    return tree


def public_surface(tree: ast.AST, contract_class_name: str):
    result = []
    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.ClassDef) or node.name != contract_class_name:
            continue
        for function in node.body:
            if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not any("gl.public" in ast.unparse(dec) for dec in function.decorator_list):
                continue
            arguments = []
            for argument in (
                function.args.posonlyargs
                + function.args.args
                + function.args.kwonlyargs
            ):
                arguments.append(
                    (
                        argument.arg,
                        ast_dump(argument.annotation) if argument.annotation is not None else None,
                    )
                )
            result.append(
                (
                    function.name,
                    tuple(arguments),
                    ast_dump(function.returns) if function.returns is not None else None,
                    tuple(ast.unparse(dec) for dec in function.decorator_list),
                )
            )
    return tuple(result)


def storage_surface(tree: ast.AST, contract_class_name: str):
    result = []
    for node in getattr(tree, "body", []):
        if not isinstance(node, ast.ClassDef):
            continue
        if node.name != contract_class_name and not any(
            "allow_storage" in ast.unparse(dec) for dec in node.decorator_list
        ):
            continue
        fields = []
        for statement in node.body:
            if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
                fields.append((statement.target.id, ast_dump(statement.annotation)))
        result.append((node.name, tuple(fields)))
    return tuple(result)


def verify_surfaces(candidate: ast.AST, canonical: ast.AST, contract_class_name: str) -> None:
    if public_surface(candidate, contract_class_name) != public_surface(canonical, contract_class_name):
        raise SystemExit("STOP: deployment artifact changed the public Controller ABI")
    if storage_surface(candidate, contract_class_name) != storage_surface(canonical, contract_class_name):
        raise SystemExit("STOP: deployment artifact changed the storage field surface")


def build_one(canonical_path: Path, deploy_path: Path, contract_class_name: str) -> None:
    canonical_bytes = canonical_path.read_bytes()
    canonical_source = canonical_bytes.decode("utf-8")
    canonical_tree = executable_tree(canonical_source)
    canonical_dump = ast_dump(canonical_tree)

    global_map, method_map = internal_symbol_maps(canonical_tree, contract_class_name)
    compact_tree = RenameInternalSymbols(global_map, method_map, contract_class_name).visit(
        copy.deepcopy(canonical_tree)
    )
    ast.fix_missing_locations(compact_tree)
    private_tree = copy.deepcopy(compact_tree)
    local_maps: list[dict[str, str]] = []
    compact_tree = apply_local_renames(compact_tree, maps=local_maps)
    ast.fix_missing_locations(compact_tree)
    source = DEPENDS + ast.unparse(copy.deepcopy(compact_tree)).lstrip("\n") + "\n"
    source = compact_indentation(source)
    source = lexical_minify(source, ast_dump(compact_tree))
    source = collapse_single_statement_suites(source, ast_dump(compact_tree))
    source = pack_same_indent_statements(source, ast_dump(compact_tree))

    parsed = ast.parse(source)
    reversed_local = apply_local_renames(
        copy.deepcopy(parsed), reverse=True, maps=local_maps
    )
    if ast_dump(reversed_local) != ast_dump(private_tree):
        raise SystemExit("STOP: local-symbol artifact failed reversible AST parity")
    reversed_tree = ReverseInternalSymbols(global_map, method_map, contract_class_name).visit(reversed_local)
    ast.fix_missing_locations(reversed_tree)
    if ast_dump(reversed_tree) != canonical_dump:
        raise SystemExit("STOP: private-symbol artifact failed reversible AST parity")
    verify_surfaces(parsed, canonical_tree, contract_class_name)

    # The artifact is intentionally allowed to differ from the canonical AST only
    # in private symbol spelling. Reversing that transformation must recover the
    # docstring-stripped canonical executable tree exactly.
    if len(source.encode("utf-8")) >= len(canonical_bytes):
        raise SystemExit("STOP: milestone deployment artifact did not reduce calldata")

    deploy_path.write_bytes(source.encode("utf-8"))
    data = deploy_path.read_bytes()
    reduction_bps = 10_000 - len(data) * 10_000 // len(canonical_bytes)
    print(f"{canonical_path.name}: CANONICAL_BYTES={len(canonical_bytes)}")
    print(f"{deploy_path.name}: DEPLOY_BYTES={len(data)}")
    print(f"{deploy_path.name}: REDUCTION_BPS={reduction_bps}")
    print(f"{canonical_path.name}: CANONICAL_SHA256={sha256(canonical_bytes)}")
    print(f"{deploy_path.name}: DEPLOY_SHA256={sha256(data)}")
    print(f"PASS {deploy_path.name} passed reversible AST/public/storage proofs")


def main() -> None:
    for canonical_path, deploy_path, contract_class_name in PAIRS:
        build_one(canonical_path, deploy_path, contract_class_name)


if __name__ == "__main__":
    main()
