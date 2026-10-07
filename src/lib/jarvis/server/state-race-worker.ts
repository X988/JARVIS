import fs from "node:fs";
import { rememberRequest } from "./idempotency.ts";

const dir = process.argv[2];
const key = process.argv[3];
const side = process.argv[4];
rememberRequest(dir, key, () => {
  fs.appendFileSync(side, `${process.pid}\n`);
  return { key };
});
