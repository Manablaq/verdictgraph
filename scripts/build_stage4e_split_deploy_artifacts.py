#!/usr/bin/env python3
"""Build AST-equivalent compact deployment artifacts for the Stage 4E split ICs."""
from __future__ import annotations
import ast, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIN = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }\n'
PAIRS = [
    (ROOT/'contracts/verdict_graph_registry.py', ROOT/'contracts/verdict_graph_registry_deploy.py'),
    (ROOT/'contracts/verdict_graph_adjudicator.py', ROOT/'contracts/verdict_graph_adjudicator_deploy.py'),
]

def strip_docstrings(node: ast.AST) -> None:
    body = getattr(node, 'body', None)
    if isinstance(body, list) and body and isinstance(body[0], ast.Expr):
        value = body[0].value
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            del body[0]
    for child in ast.iter_child_nodes(node):
        strip_docstrings(child)

def normalized_tree(text: str) -> str:
    tree = ast.parse(text)
    strip_docstrings(tree)
    ast.fix_missing_locations(tree)
    return ast.dump(tree, include_attributes=False)

for source, target in PAIRS:
    readable = source.read_text()
    tree = ast.parse(readable)
    strip_docstrings(tree)
    ast.fix_missing_locations(tree)
    compact = PIN + ast.unparse(tree) + '\n'
    if normalized_tree(readable) != normalized_tree(compact):
        raise SystemExit(f'AST parity failure for {source.name}')
    target.write_text(compact)
    print(f'{source.name}: READABLE_BYTES={len(readable.encode())} DEPLOY_BYTES={len(compact.encode())} DEPLOY_SHA256={hashlib.sha256(compact.encode()).hexdigest()}')
