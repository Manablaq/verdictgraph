#!/usr/bin/env node
/** Keyless Bradbury deployment estimator for one Stage 4E split IC. */
import fs from "node:fs";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const contractPath = process.argv[2];
const kind = process.argv[3];
const deployer = (process.env.VERDICTGRAPH_DEPLOYER ?? "").toLowerCase();
const STOP = "VERDICTGRAPH_STAGE4E_BLOCKED_SEND";
if (!contractPath || !fs.existsSync(contractPath)) throw new Error(`Missing contract: ${contractPath}`);
if (!["registry", "adjudicator"].includes(kind)) throw new Error(`Invalid kind: ${kind}`);
if (!/^0x[0-9a-f]{40}$/.test(deployer)) throw new Error(`Invalid deployer: ${deployer}`);

const code = fs.readFileSync(contractPath, "utf8");
const args = kind === "registry" ? [] : [deployer];
let gasRejected = false;
let gasReason = "";
let blockedSend = false;
const originalError = console.error.bind(console);
console.error = (...values) => {
  const text = values.map(v => v instanceof Error ? v.message : typeof v === "string" ? v : String(v)).join(" ");
  if (text.includes("Gas estimation failed, using default 200_000")) { gasRejected = true; gasReason = text; }
};
const blockingProvider = {
  async request({method}) {
    if (method === "eth_chainId") return "0x107d";
    if (["eth_sendTransaction","eth_sendRawTransaction","eth_signTransaction","personal_sign","eth_signTypedData_v4"].includes(method)) {
      blockedSend = true;
      throw new Error(STOP);
    }
    throw new Error(`Unexpected provider method in no-send probe: ${method}`);
  },
};
const client = createClient({chain:testnetBradbury, account:deployer, provider:blockingProvider});
let caught;
try { await client.deployContract({code,args}); throw new Error("probe unexpectedly returned"); }
catch (error) { caught = error; }
console.error = originalError;
if (!blockedSend || !String(caught?.message ?? caught).includes(STOP)) {
  console.error(`RESULT=PROBE_ERROR kind=${kind} contract=${contractPath}`); console.error(caught); process.exit(3);
}
if (gasRejected) {
  const reason = gasReason.includes("BlockPubdataLimitReached") ? "BlockPubdataLimitReached" : gasReason.replace(/\s+/g," ").slice(0,400);
  console.log(`RESULT=REJECTED kind=${kind} contract=${contractPath} reason=${reason}`);
  console.log("PASS no signing or transaction submission occurred");
  process.exit(2);
}
console.log(`RESULT=ACCEPTED kind=${kind} contract=${contractPath}`);
console.log(`PASS Bradbury accepted eth_estimateGas for ${contractPath}`);
console.log(`PASS provider blocked transaction submission for ${deployer}`);
console.log("PASS no private key, signature, or transaction was used by this probe");
