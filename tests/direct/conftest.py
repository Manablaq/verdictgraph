"""Shared VerdictGraph Direct Mode helpers."""

from datetime import datetime

TEST_TIME_ISO = "2026-09-06T10:00:00+00:00"
TEST_TIME_UNIX = int(datetime.fromisoformat(TEST_TIME_ISO).timestamp())


def _validated_hex_address(value: str) -> str:
    value = value.strip()
    if value.startswith("0X"):
        value = "0x" + value[2:]
    if not value.startswith("0x") or len(value) != 42:
        raise ValueError("Address must be a 20-byte 0x-prefixed hexadecimal value")
    try:
        raw = bytes.fromhex(value[2:])
    except ValueError as exc:
        raise ValueError("Address contains non-hexadecimal characters") from exc
    if len(raw) != 20:
        raise ValueError("Address must be exactly 20 bytes")
    return "0x" + raw.hex()


def to_hex(addr):
    """Return a strict lowercase 20-byte hex address without importing GenLayer.

    Direct Mode injects the pinned GenLayer SDK path only while loading a
    contract. Split-contract tests need to encode the peer contract address
    *before* the first contract in that isolated process is deployed, so this
    helper must remain runtime-SDK independent.
    """
    if hasattr(addr, "as_hex"):
        value = addr.as_hex
        if callable(value):
            value = value()
        if not isinstance(value, str):
            raise TypeError("Address-like as_hex must be a string")
        return _validated_hex_address(value)

    if isinstance(addr, str):
        return _validated_hex_address(addr)

    if isinstance(addr, (bytes, bytearray, memoryview)):
        raw = bytes(addr)
    else:
        try:
            raw = bytes(addr)
        except (TypeError, ValueError) as exc:
            raise TypeError("Address must be bytes, a hex string, or address-like") from exc

    if len(raw) != 20:
        raise ValueError("Address must be exactly 20 bytes")
    return "0x" + raw.hex()
