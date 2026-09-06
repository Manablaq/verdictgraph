#!/usr/bin/env node
/** Live Bradbury deployment estimator that is technically incapable of sending. */
import fs from "node:fs";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const corePath = process.argv[2];
const deployer = (process.env.VERDICTGRAPH_DEPLOYER ?? "").toLowerCase();
const STOP = "VERDICTGRAPH_STAGE4D_BLOCKED_SEND";

if (!corePath || !fs.existsSync(corePath)) throw new Error(`Missing candidate: ${corePath}`);
if (!/^0x[0-9a-f]{40}$/.test(deployer)) throw new Error(`Invalid deployer: ${deployer}`);

const code = fs.readFileSync(corePath, "utf8");
let gasRejected = false;
let gasReason = "";
let blockedSend = false;

const originalError = console.error.bind(console);
console.error = (...args) => {
  const text = args.map((value) => {
    if (value instanceof Error) return value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(" ");
  if (text.includes("Gas estimation failed, using default 200_000")) {
    gasRejected = true;
    gasReason = text;
  }
  // Suppress SDK stack noise. The normalized result is printed below.
};

const blockingProvider = {
  async request({ method }) {
    if (method === "eth_chainId") return "0x107d";
    if ([
      "eth_sendTransaction",
      "eth_sendRawTransaction",
      "eth_signTransaction",
      "personal_sign",
      "eth_signTypedData_v4",
    ].includes(method)) {
      blockedSend = true;
      throw new Error(STOP);
    }
    throw new Error(`Unexpected provider method in no-send probe: ${method}`);
  },
};

const client = createClient({
  chain: testnetBradbury,
  account: deployer,
  provider: blockingProvider,
});

let caught;
try {
  await client.deployContract({ code, args: [] });
  throw new Error("STOP: no-send probe unexpectedly returned");
} catch (error) {
  caught = error;
}
console.error = originalError;

if (!blockedSend || !String(caught?.message ?? caught).includes(STOP)) {
  console.error(`RESULT=PROBE_ERROR candidate=${corePath}`);
  console.error(caught);
  process.exit(3);
}

if (gasRejected) {
  const reason = gasReason.includes("BlockPubdataLimitReached")
    ? "BlockPubdataLimitReached"
    : gasReason.replace(/\s+/g, " ").slice(0, 400);
  console.log(`RESULT=REJECTED candidate=${corePath} reason=${reason}`);
  console.log("PASS no signing or transaction submission occurred");
  process.exit(2);
}

console.log(`RESULT=ACCEPTED candidate=${corePath}`);
console.log(`PASS Bradbury accepted eth_estimateGas for ${corePath}`);
console.log(`PASS provider blocked transaction submission for ${deployer}`);
console.log("PASS no private key, signature, or transaction was used by this probe");
