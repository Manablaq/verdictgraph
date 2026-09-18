#!/usr/bin/env node
/** Keyless Bradbury deployment estimator for one milestone IC artifact. */
import fs from "node:fs";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const contractPath = process.argv[2];
const role = process.argv[3] ?? "milestone IC";
const deployer = (process.env.VERDICTGRAPH_DEPLOYER ?? "").toLowerCase();
const constructorArgs = JSON.parse(process.env.VERDICTGRAPH_MILESTONE_CONSTRUCTOR_ARGS_JSON ?? "[]");
const STOP = "VERDICTGRAPH_MILESTONE_BLOCKED_SEND";

if (!contractPath || !fs.existsSync(contractPath)) throw new Error(`Missing contract: ${contractPath}`);
if (!/^0x[0-9a-f]{40}$/.test(deployer)) throw new Error(`Invalid VERDICTGRAPH_DEPLOYER: ${deployer}`);
if (!Array.isArray(constructorArgs) || constructorArgs.length !== 2 || !constructorArgs.every((value) => typeof value === "string")) {
  throw new Error("VERDICTGRAPH_MILESTONE_CONSTRUCTOR_ARGS_JSON must contain exactly two string constructor arguments");
}

const code = fs.readFileSync(contractPath, "utf8");
let gasRejected = false;
let gasReason = "";
let blockedSend = false;
const originalError = console.error.bind(console);
console.error = (...values) => {
  const message = values.map((value) => value instanceof Error ? value.message : String(value)).join(" ");
  if (message.includes("Gas estimation failed, using default 200_000")) {
    gasRejected = true;
    gasReason = message;
  }
};

const blockingProvider = {
  async request({ method }) {
    if (method === "eth_chainId") return "0x107d";
    if (["eth_sendTransaction", "eth_sendRawTransaction", "eth_signTransaction", "personal_sign", "eth_signTypedData_v4"].includes(method)) {
      blockedSend = true;
      throw new Error(STOP);
    }
    throw new Error(`Unexpected provider method in no-send probe: ${method}`);
  },
};

const client = createClient({ chain: testnetBradbury, account: deployer, provider: blockingProvider });
let caught;
try {
  await client.deployContract({ code, args: constructorArgs });
  throw new Error("probe unexpectedly returned");
} catch (error) {
  caught = error;
}
console.error = originalError;

if (!blockedSend || !String(caught?.message ?? caught).includes(STOP)) {
  console.error(`RESULT=PROBE_ERROR role=${role} contract=${contractPath}`);
  console.error(caught);
  process.exit(3);
}
if (gasRejected) {
  const reason = gasReason.includes("BlockPubdataLimitReached") ? "BlockPubdataLimitReached" : gasReason.replace(/\s+/g, " ").slice(0, 400);
  console.log(`RESULT=REJECTED role=${role} contract=${contractPath} reason=${reason}`);
  console.log("PASS no signing or transaction submission occurred");
  process.exit(2);
}
console.log(`RESULT=ACCEPTED role=${role} contract=${contractPath}`);
console.log(`PASS Bradbury accepted eth_estimateGas for ${role}`);
console.log(`PASS provider blocked transaction submission for ${deployer}`);
console.log("PASS no private key, signature, or transaction was used by this probe");
