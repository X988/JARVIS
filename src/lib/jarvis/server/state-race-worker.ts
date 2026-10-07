import fs from "node:fs";
import { takeToken } from "../rate-limit.ts";
import { rememberRequest } from "./idempotency.ts";

const mode = process.argv[2];
const dir = process.argv[3];

if (mode === "idempotency") {
  const actor = process.argv[4];
  const requestId = process.argv[5];
  const side = process.argv[6];
  rememberRequest(dir, actor, requestId, () => {
    fs.appendFileSync(side, `${process.pid}\n`);
    return { actor, requestId };
  });
} else if (mode === "rate-limit") {
  const key = process.argv[4];
  const side = process.argv[5];
  process.env.JARVIS_STATE_DIR = dir;
  if (takeToken(key, 100, 60_000)) {
    fs.appendFileSync(side, `${process.pid}\n`);
  } else {
    process.exitCode = 2;
  }
} else {
  throw new Error("unknown state-race worker mode");
}
