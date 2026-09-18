#!/usr/bin/env node
/** Keyless Bradbury probe for the documented native GenLayerJS write path. */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const deployer = (process.env.VERDICTGRAPH_DEPLOYER ?? "").toLowerCase();
const target = (process.env.VERDICTGRAPH_MILESTONE_WRITE_TARGET ?? "").toLowerCase();
const functionName = process.env.VERDICTGRAPH_MILESTONE_WRITE_FUNCTION ?? "";
const args = JSON.parse(process.env.VERDICTGRAPH_MILESTONE_WRITE_ARGS_JSON ?? "null");
const STOP = "VERDICTGRAPH_MILESTONE_NATIVE_WRITE_NO_SEND";

if (!/^0x[0-9a-f]{40}$/.test(deployer)) {
  throw new Error(`Invalid VERDICTGRAPH_DEPLOYER: ${deployer}`);
}
if (!/^0x[0-9a-f]{40}$/.test(target)) {
  throw new Error(`Invalid VERDICTGRAPH_MILESTONE_WRITE_TARGET: ${target}`);
}
if (!functionName || !Array.isArray(args)) {
  throw new Error("A write function and JSON array of calldata arguments are required");
}

const blockingProvider = {
  async request({ method }) {
    if (method === "eth_sendTransaction") {
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
  await client.writeContract({
    address: target,
    functionName,
    args,
    value: 0n,
  });
  throw new Error("probe unexpectedly returned");
} catch (error) {
  caught = error;
}

if (!String(caught?.message ?? caught).includes(STOP)) {
  console.error(`RESULT=PROBE_ERROR target=${target} function=${functionName}`);
  console.error(caught);
  process.exit(3);
}

console.log(`RESULT=ACCEPTED target=${target} function=${functionName}`);
console.log("PASS documented Bradbury-native SDK write path reached wallet send");
console.log("PASS no FeeManager policy preset was required by the write path");
console.log("PASS provider blocked transaction submission before signing or sending");
