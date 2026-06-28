"""
EIP-712 typed-data digest for the Casper x402 `exact` scheme.

Ports the official `@casper-ecosystem/casper-eip-712` + `@make-software/casper-x402`
client construction so the CSPR.cloud x402 facilitator (`/verify`, `/settle`) accepts
our payments. Verified end-to-end against the live facilitator (isValid: true).

The payer signs the 32-byte digest below with its ed25519 key; the facilitator
recomputes the same digest and checks the signature, then submits a CEP-18
`transfer_with_authorization` deploy to move the tokens.

Domain  (CASPER_DOMAIN_TYPES):
    EIP712Domain(string name,string version,string chain_name,bytes32 contract_package_hash)
Struct  (transferWithAuthorization):
    TransferWithAuthorization(address from,address to,uint256 value,
                              uint256 validAfter,uint256 validBefore,bytes32 nonce)
Digest  = keccak256(0x1901 || domainSeparator || structHash)

`from`/`to` are Casper account-hash addresses ("00" + 32-byte hash); under the
`address` type a 33-byte Casper address is encoded as keccak256(33 bytes).
"""

from __future__ import annotations

from Crypto.Hash import keccak as _keccak

_DOMAIN_TYPESTRING = (
    b"EIP712Domain(string name,string version,string chain_name,"
    b"bytes32 contract_package_hash)"
)
_STRUCT_TYPESTRING = (
    b"TransferWithAuthorization(address from,address to,uint256 value,"
    b"uint256 validAfter,uint256 validBefore,bytes32 nonce)"
)


def keccak256(data: bytes) -> bytes:
    h = _keccak.new(digest_bits=256)
    h.update(data)
    return h.digest()


def _strip0x(h: str) -> str:
    return h[2:] if h.startswith(("0x", "0X")) else h


def _enc_string(s: str) -> bytes:
    return keccak256(s.encode())


def _enc_uint256(v: int) -> bytes:
    return int(v).to_bytes(32, "big")


def _enc_bytes32(h: str) -> bytes:
    b = bytes.fromhex(_strip0x(h))
    if len(b) != 32:
        raise ValueError(f"bytes32 must be 32 bytes, got {len(b)}")
    return b


def _enc_address(h: str) -> bytes:
    """EIP-712 `address` encoding. 20-byte → left-pad to 32; 33-byte Casper
    address (01/00 prefix + 32-byte hash) → keccak256 of the full 33 bytes."""
    b = bytes.fromhex(_strip0x(h))
    if len(b) == 20:
        return b"\x00" * 12 + b
    if len(b) == 33:
        return keccak256(b)
    raise ValueError(f"address must be 20 or 33 bytes, got {len(b)}")


def domain_separator(name: str, version: str, chain_name: str,
                     contract_package_hash: str) -> bytes:
    """keccak256(typeHash || enc(name) || enc(version) || enc(chain_name) || enc(pkgHash))."""
    parts = [
        keccak256(_DOMAIN_TYPESTRING),
        _enc_string(name),
        _enc_string(version),
        _enc_string(chain_name),
        _enc_bytes32(contract_package_hash),
    ]
    return keccak256(b"".join(parts))


def _struct_hash(frm: str, to: str, value: int, valid_after: int,
                 valid_before: int, nonce: str) -> bytes:
    parts = [
        keccak256(_STRUCT_TYPESTRING),
        _enc_address(frm),
        _enc_address(to),
        _enc_uint256(value),
        _enc_uint256(valid_after),
        _enc_uint256(valid_before),
        _enc_bytes32(nonce),
    ]
    return keccak256(b"".join(parts))


def transfer_authorization_digest(
    *,
    name: str,
    version: str,
    network: str,
    asset: str,
    frm: str,
    to: str,
    value: int,
    valid_after: int,
    valid_before: int,
    nonce: str,
) -> bytes:
    """
    32-byte EIP-712 digest the payer signs for a CEP-18 `transfer_with_authorization`.

    `network` is the CAIP-2 id (e.g. "casper:casper-test") used as `chain_name`;
    `asset` is the 64-hex CEP-18 contract package hash; `frm`/`to` are account-hash
    addresses ("00"+hash); `nonce` is 32-byte hex. Mirrors the official JS client.
    """
    dom = domain_separator(name, version, network, "0x" + _strip0x(asset))
    st = _struct_hash(
        "0x" + _strip0x(frm), "0x" + _strip0x(to),
        int(value), int(valid_after), int(valid_before), "0x" + _strip0x(nonce),
    )
    return keccak256(b"\x19\x01" + dom + st)
