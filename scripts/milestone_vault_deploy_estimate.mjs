#!/usr/bin/env node
/** Keyless Bradbury creation-gas estimator for the milestone EVM Vault. */
import fs from "node:fs";

const artifactPath = process.argv[2] ?? "out/VerdictGraphMilestoneVault.sol/VerdictGraphMilestoneVault.json";
const deployer = (process.env.VERDICTGRAPH_DEPLOYER ?? "").toLowerCase();
const registry = (process.env.VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS ?? process.env.VERDICTGRAPH_MILESTONE_CONTROLLER_ADDRESS ?? "").toLowerCase();
const rpcUrl = process.env.VERDICTGRAPH_EVM_RPC ?? "https://rpc.testnet-chain.genlayer.com";

if (!fs.existsSync(artifactPath)) throw new Error(`Missing Vault artifact: ${artifactPath}`);
if (!/^0x[0-9a-f]{40}$/.test(deployer)) throw new Error("Invalid VERDICTGRAPH_DEPLOYER");
if (!/^0x[0-9a-f]{40}$/.test(registry)) throw new Error("Invalid VERDICTGRAPH_MILESTONE_REGISTRY_ADDRESS");

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const creationBytecode = artifact?.bytecode?.object;
if (typeof creationBytecode !== "string" || !/^0x[0-9a-f]+$/i.test(creationBytecode)) {
  throw new Error(`Vault artifact has no usable creation bytecode: ${artifactPath}`);
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`Bradbury RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}

const chainId = await rpc("eth_chainId", []);
if (chainId !== "0x107d") throw new Error(`Unexpected Bradbury chain id: ${chainId}`);

// The constructor has one address argument: abi.encode(address registry).
const constructorArg = registry.slice(2).padStart(64, "0");
const data = `${creationBytecode}${constructorArg}`;
let gas;
try {
  gas = await rpc("eth_estimateGas", [{ from: deployer, data }, "latest"]);
} catch (error) {
  const reason = String(error?.message ?? error).replace(/\s+/g, " ").slice(0, 500);
  console.log(`RESULT=REJECTED artifact=${artifactPath} reason=${reason}`);
  console.log("PASS no signing or transaction submission occurred");
  process.exit(2);
}

if (typeof gas !== "string" || !/^0x[0-9a-f]+$/i.test(gas)) {
  throw new Error(`Bradbury returned an invalid gas estimate: ${gas}`);
}
console.log(`RESULT=ACCEPTED artifact=${artifactPath} gas=${gas}`);
console.log(`PASS Bradbury accepted eth_estimateGas for the milestone Vault from ${deployer}`);
console.log(`PASS constructor binds the Vault to ${registry}`);
console.log("PASS no private key, signature, or transaction was used by this probe");
