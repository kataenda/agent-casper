"""
Generate a fresh ed25519 buyer identity for the x402 --settle demo.

Writes buyer_key.pem and prints the public key + account hash so you know
where to send mainnet CSPR before running:

    .venv\\Scripts\\python.exe demo_buyer_agent.py --settle --key buyer_key.pem --cloud-key <KEY>
"""
import sys

sys.path.insert(0, "backend")
from pycspr.crypto import KeyAlgorithm, get_key_pair, get_pvk_pem_from_bytes  # noqa: E402
import pycspr  # noqa: E402

OUT = "buyer_key.pem"

pvk, _pbk = get_key_pair(KeyAlgorithm.ED25519)
pem = get_pvk_pem_from_bytes(pvk, KeyAlgorithm.ED25519)
with open(OUT, "wb") as f:
    f.write(pem)

kp = pycspr.parse_private_key(OUT, pycspr.KeyAlgorithm.ED25519)
pub = kp.account_key.hex()
acct = kp.account_hash.hex()

print(f"  saved          : {OUT}")
print(f"  public key     : {pub}")
print(f"  account hash   : account-hash-{acct}")
print(f"  fund this on MAINNET (>= ~10 CSPR):")
print(f"  https://cspr.live/account/{pub}")
