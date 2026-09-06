#!/usr/bin/env node
/**
 * Read-only Bradbury deployment estimator for VerdictGraph Core.
 *
 * It intentionally supplies an address-only account plus a provider that
 * refuses every signing/sending method. GenLayerJS therefore builds the exact
 * deployment payload and reaches eth_estimateGas against Bradbury, but cannot
 * submit a transaction after estimation.
 */
import fs from "node:fs";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const CORE_PATH = process.argv[2] ?? "contracts/verdict_graph_core_deploy.py";
const DEPLOYER = (process.env.VERDICTGRAPH_DEPLOYER ?? "0x1f87ae197af539253978d435ad45ccf28fb95024").toLowerCase();
const STOP = "VERDICTGRAPH_PROBE_BLOCKED_SEND";

if (!/^0x[0-9a-f]{40}$/.test(DEPLOYER)) {
  throw new Error(`Invalid deployer address: ${DEPLOYER}`);
}

const code = fs.readFileSync(CORE_PATH, "utf8");
let gasEstimationFailed = false;
let gasFailureText = "";
let blockedSend = false;

const originalError = console.error.bind(console);
console.error = (...args) => {
  const rendered = args.map((value) => {
    if (value instanceof Error) return value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(" ");
  if (rendered.includes("Gas estimation failed, using default 200_000")) {
    gasEstimationFailed = true;
    gasFailureText = rendered;
  }
  originalError(...args);
};

const blockingProvider = {
  async request({ method }) {
    if (method === "eth_chainId") return "0x107d";
    if (["eth_sendTransaction", "eth_sendRawTransaction", "eth_signTransaction", "personal_sign", "eth_signTypedData_v4"].includes(method)) {
      blockedSend = true;
      throw new Error(STOP);
    }
    throw new Error(`Unexpected wallet-provider method in no-send probe: ${method}`);
  },
};

const client = createClient({
  chain: testnetBradbury,
  account: DEPLOYER,
  provider: blockingProvider,
});

let caught;
try {
  await client.deployContract({ code, args: [] });
  throw new Error("STOP: deployment probe unexpectedly returned without hitting send blocker");
} catch (error) {
  caught = error;
}

console.error = originalError;

if (!blockedSend || !String(caught?.message ?? caught).includes(STOP)) {
  console.error("FAIL probe did not stop at the protected send boundary");
  console.error(caught);
  process.exit(3);
}

if (gasEstimationFailed) {
  console.error("FAIL Bradbury rejected deployment gas estimation for compact Core");
  console.error(gasFailureText);
  console.error("PASS no signing or transaction submission occurred");
  process.exit(2);
}

console.log(`PASS Bradbury accepted eth_estimateGas for ${CORE_PATH}`);
console.log(`PASS provider blocked transaction submission for ${DEPLOYER}`);
console.log("PASS no private key, signature, or transaction was used by this probe");
