#!/usr/bin/env python3
"""Checks split GenLayer EVM interfaces against the dual-controller Vault ABI."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
registry=(root/'contracts/verdict_graph_registry.py').read_text()
adjudicator=(root/'contracts/verdict_graph_adjudicator.py').read_text()
vault=(root/'evm/contracts/VerdictGraphVault.sol').read_text()
for token in ['def registry_core(self) -> Address:','def adjudicator_core(self) -> Address:','def handoff_status(self, handoff_id: u256, /) -> u256:','def register_handoff(','def apply_handoff_completion(']:
    if token not in registry: raise SystemExit(f'Registry EVM interface missing: {token}')
for token in ['def registry_core(self) -> Address:','def adjudicator_core(self) -> Address:','def handoff_status(self, handoff_id: u256, /) -> u256:','def apply_final_verdict(']:
    if token not in adjudicator: raise SystemExit(f'Adjudicator EVM interface missing: {token}')
for token in ['address public immutable registry_core;','address public immutable adjudicator_core;','function handoff_status(uint256 handoffId) external view returns (uint256)','function register_handoff(','function apply_handoff_completion(','function apply_final_verdict(','onlyRegistryCore','onlyAdjudicatorCore']:
    if token not in vault: raise SystemExit(f'Vault ABI/controller surface missing: {token}')

def body(text,fn):
    m=re.search(rf'(?:def|function) {fn}\((.*?)\)(?: -> .*?:| external)',text,re.S)
    if not m: raise SystemExit(f'Could not parse {fn}')
    return m.group(1)
def count(x): return len([p for p in x.split(',') if p.strip() and p.strip()!='/'])
for source,fn in [(registry,'register_handoff'),(registry,'apply_handoff_completion'),(adjudicator,'apply_final_verdict')]:
    a=count(body(source,fn))-1; b=count(body(vault,fn))
    if a!=b: raise SystemExit(f'{fn} parameter count drift: ic={a}, vault={b}')
print('PASS split Registry/Adjudicator EVM interfaces and dual-controller Vault ABI remain aligned')
