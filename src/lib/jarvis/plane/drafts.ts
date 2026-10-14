import fs from "node:fs";
import path from "node:path";

export type DraftRunbook = { id: string; title: string; steps: string[]; reviewed: boolean };

export function proposeRunbook(dir: string, draft: DraftRunbook): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${draft.id}.json`), JSON.stringify({ ...draft, reviewed: false }));
}

export function activateRunbook(draft: DraftRunbook): { code: "DENY"; reason: string } {
  return { code: "DENY", reason: draft.reviewed ? "активацию делает человек отдельной заявкой" : "черновик сам не становится боевым runbook" };
}
