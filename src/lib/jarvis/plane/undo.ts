import fs from "node:fs";
import path from "node:path";

export type UndoEntry = { at: string; file: string; before: string; after: string };

export function recordUndo(
  dir: string,
  entry: UndoEntry & { kind: "file" | "reboot" | "database" },
): { ok: true } | { ok: false; code: "NOT_UNDOABLE" } {
  if (entry.kind !== "file") return { ok: false, code: "NOT_UNDOABLE" };
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "undo.jsonl"), `${JSON.stringify(entry)}\n`);
  return { ok: true };
}
