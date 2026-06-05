from pycspr.crypto import KeyAlgorithm, get_key_pair, get_pvk_pem_from_bytes, get_account_hash, get_account_key
pvk, pbk = get_key_pair(KeyAlgorithm.ED25519)
pem_bytes = get_pvk_pem_from_bytes(pvk, KeyAlgorithm.ED25519)
with open("agent_secret_key.pem", "wb") as f:
    f.write(pem_bytes)
acct_key = get_account_key(KeyAlgorithm.ED25519, pbk)
acct_hash = get_account_hash(acct_key)
print(f"Public key  : 01{pbk.hex()}")
print(f"Account hash: account-hash-{acct_hash.hex()}")
print("PEM saved: agent_secret_key.pem")
