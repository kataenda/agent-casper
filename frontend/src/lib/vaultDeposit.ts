/**
 * Real vault custody — deposit (payable) + withdraw builders.
 *
 * The YieldVault `deposit()` entry point is Odra `#[odra(payable)]`, so attaching
 * real CSPR requires the Odra **proxy-caller** pattern (a plain contract call can't
 * carry purse value). We build a legacy Deploy whose session is the proxy wasm
 * (ModuleBytes) with the outer args Odra expects — matching the casper-ecosystem
 * donation-demo — then sign it with the same Casper Wallet flow VaultControls uses.
 *
 * `withdraw(amount)` is a NORMAL (non-payable) call, so it's a standard stored
 * contract call. Both are gated on NEXT_PUBLIC_VAULT_PACKAGE_HASH.
 *
 * NOT yet wired into the live UI — see docs/REAL_CUSTODY.md for the wiring step.
 * Untested until the payable contract is deployed and the proxy wasm is served.
 */

const BACKEND      = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PACKAGE_HASH = process.env.NEXT_PUBLIC_VAULT_PACKAGE_HASH || "";
const CHAIN        = "casper-test";
const GAS_DEPOSIT  = "6000000000"; // 6 CSPR — running the proxy wasm costs more than a plain call
const GAS_WITHDRAW = "3000000000"; // 3 CSPR

export function isRealVaultEnabled(): boolean {
  return PACKAGE_HASH.trim().length > 0;
}

function csprToMotes(amountCspr: string): string {
  return BigInt(Math.floor(parseFloat(amountCspr) * 1_000_000_000)).toString();
}

function stripPrefix(h: string): string {
  return h.replace(/^(hash-|package-|contract-)/, "");
}

/** Fetch the Odra proxy-caller wasm the payable deposit is wrapped in. */
export async function fetchProxyWasm(): Promise<Uint8Array> {
  const res = await fetch(`${BACKEND}/vault/proxy-wasm`);
  if (!res.ok) throw new Error("proxy_caller.wasm unavailable — see docs/REAL_CUSTODY.md");
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Build the payable deposit deploy: proxy wasm (ModuleBytes) forwarding
 * `amount` CSPR into the vault's payable `deposit()` entry point.
 * Returns { deploy, sdk } — caller signs + submits with the existing wallet flow.
 */
export async function buildDepositDeploy(senderPubKeyHex: string, amountCspr: string) {
  if (!PACKAGE_HASH) throw new Error("NEXT_PUBLIC_VAULT_PACKAGE_HASH not set — deploy the payable vault first");
  const sdk = await import("casper-js-sdk") as any;
  const { Deploy, DeployHeader, ExecutableDeployItem, ModuleBytes,
          Args, CLValue, CLTypeUInt8, Hash, PublicKey, Duration, Timestamp } = sdk;

  const proxyWasm   = await fetchProxyWasm();
  const amountMotes = csprToMotes(amountCspr);

  // deposit() takes no inner args (it reads attached_value); serialize an empty arg set.
  const innerBytes     = Args.fromMap({}).toBytes();
  const serializedArgs = CLValue.newCLList(
    CLTypeUInt8,
    Array.from(innerBytes as Uint8Array).map((b: number) => CLValue.newCLUint8(b)),
  );

  const args = Args.fromMap({
    amount:         CLValue.newCLUInt512(amountMotes),
    attached_value: CLValue.newCLUInt512(amountMotes),
    entry_point:    CLValue.newCLString("deposit"),
    package_hash:   CLValue.newCLByteArray(Hash.fromHex(stripPrefix(PACKAGE_HASH)).toBytes()),
    args:           serializedArgs,
  });

  const session = new ExecutableDeployItem();
  session.moduleBytes = new ModuleBytes(proxyWasm, args);

  const header = new DeployHeader();
  header.account   = PublicKey.fromHex(senderPubKeyHex);
  header.chainName = CHAIN;
  header.gasPrice  = 1;
  header.ttl       = new Duration(1800000);
  header.timestamp = new Timestamp(new Date());
  header.dependencies = [];

  const deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment(GAS_DEPOSIT), session);
  return { deploy, sdk };
}

/**
 * Build the withdraw deploy: a normal stored-contract call to `withdraw(amount)`,
 * which transfers real CSPR from the vault purse back to the caller.
 */
export async function buildWithdrawDeploy(senderPubKeyHex: string, amountCspr: string) {
  if (!PACKAGE_HASH) throw new Error("NEXT_PUBLIC_VAULT_PACKAGE_HASH not set — deploy the payable vault first");
  const sdk = await import("casper-js-sdk") as any;
  const { Deploy, DeployHeader, ExecutableDeployItem, StoredVersionedContractByHash,
          ContractHash, Args, CLValue, Hash, PublicKey, Duration, Timestamp } = sdk;

  const amountMotes = csprToMotes(amountCspr);
  const chash   = new ContractHash(Hash.fromHex(stripPrefix(PACKAGE_HASH)), "hash-");
  const stored  = new StoredVersionedContractByHash(
    chash, "withdraw", Args.fromMap({ amount: CLValue.newCLUInt512(amountMotes) }),
  );

  const session = new ExecutableDeployItem();
  session.storedVersionedContractByHash = stored;

  const header = new DeployHeader();
  header.account   = PublicKey.fromHex(senderPubKeyHex);
  header.chainName = CHAIN;
  header.gasPrice  = 1;
  header.ttl       = new Duration(1800000);
  header.timestamp = new Timestamp(new Date());
  header.dependencies = [];

  const deploy = Deploy.makeDeploy(header, ExecutableDeployItem.standardPayment(GAS_WITHDRAW), session);
  return { deploy, sdk };
}
