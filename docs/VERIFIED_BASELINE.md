# Verified baseline — 2026-09-06

This file records the sources used to avoid version/API guessing during VerdictGraph development.

## GenLayer sources

- A user-provided GenLayer documentation snapshot was reviewed in full before this build; public reproducibility is anchored to the pinned official source commits listed below rather than to a local snapshot filename.
- Current official project boilerplate commit inspected: `e685f1f12c4c357787d48390692a654baf576f03`.
- Official `genlayer-py` `v0.18` branch head: `a3dc35e04898e3889cbfa855bcaf7d2664675b8f`.
- Official `genlayer-testing-suite` `v0.29` branch head: `9c09578b143905471fb0657dd53bdaf18da8e35f`.
- Official `genvm-linter` `main` head checked on 2026-09-06: `28450e665666300fc648dbe495110dfd0cb6a7b4`.
- Published `genlayer-js` `v1.1.8` tag resolves to commit `4303db00c428d57c6d8e5b04a75043ea42d4b0e7`.
- Current official `genlayer-js` main checked for fee-aware APIs resolves to exact commit `1b7f50a3a3f2963ea857941b0fb386081dd5c326`. VerdictGraph pins this commit directly; it does **not** depend on a floating `main` branch.

## Verified API/design facts used in source

- GenVM dependency magic comment is pinned in the Intelligent Contract.
- `TreeMap`/typed persistent storage and `@allow_storage` dataclasses are used; storage collections are not manually assigned bare `TreeMap()` values in `__init__`.
- Transaction time is derived from GenVM transaction context.
- Storage values needed by nondeterministic blocks are copied to memory with `gl.storage.copy_to_memory`.
- Custom consensus uses `gl.vm.run_nondet_unsafe` and validators independently re-fetch/reason.
- Direct Mode supports captured validator execution via `direct_vm.run_validator()`.
- EVM interaction uses `@gl.evm.contract_interface`, `.view()` and finality-only `.emit()`.
- The Intelligent Contract and its EVM ghost share the same address for EVM sender authentication.
- External IC→EVM effects are finality-only; irreversible effects are not emitted at accepted stage.
- Studio does not provide the live Core→EVM integration proof required for this design; Bradbury verification remains mandatory.
- Current fee-aware GenLayerJS source exposes `estimateTransactionFeesForWrite`, `fees` on `writeContract`, `messageAllocations`, `feeValue`, and `TransactionHashVariant`.
- Current Bradbury chain definition in that SDK includes a `feeManagerContract` and chain ID `4221` (`0x107d`).
- VerdictGraph maps finalized reads to `TransactionHashVariant.LATEST_FINAL` and provisional/latest-nonfinal reads to `LATEST_NONFINAL`.
- Core write success is not inferred from consensus status alone; the frontend checks `FINISHED_WITH_RETURN`.

## Why the frontend SDK pin differs from the published v1.1.8 artifact

The latest published GitHub release is still v1.1.8, but that exact released source does not contain the current fee-aware write-estimation helpers. The current official source does. Because VerdictGraph emits finality-only EVM messages whose fees must be budgeted, the repository pins the exact verified current source commit rather than pretending the published artifact exposes APIs it does not have.

This is an explicit, reproducible dependency choice. For the released build, the exact pinned commit was installed and the production build plus Bradbury fee paths were executed successfully; see `docs/BUILD_STATUS.md` and `deploy/public-hosting.finality.json`.

## Solidity baseline

Current official GenLayer Solidity sources inspected during the build use `pragma solidity ^0.8.20` in the relevant contract set. VerdictGraph uses `^0.8.20`. The final dual-controller Vault was compiled and tested with Solidity `0.8.20` under Foundry `1.8.1`; see `docs/BUILD_STATUS.md`.

## Rule for future edits

If a GenLayer API, network parameter, SDK behavior or tool version is uncertain/version-sensitive, verify it against the exact docs snapshot and current official source/docs before changing code. Do not infer it from memory.
