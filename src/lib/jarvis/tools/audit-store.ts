import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactRecord } from "./redact.ts";
import type { AuditRecord } from "./types.ts";

export type AuditStore = {
  append(record: AuditRecord): Promise<void>;
  list(): Promise<AuditRecord[]>;
};

export function createMemoryAuditStore(): AuditStore & { records: AuditRecord[] } {
  const records: AuditRecord[] = [];
  return {
    records,
    async append(record) {
      records.push(redactRecord(record));
    },
    async list() {
      return [...records].reverse();
    },
  };
}

export function createFileAuditStore(filePath: string): AuditStore {
  return {
    async append(record) {
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(redactRecord(record))}\n`, "utf8");
    },
    async list() {
      let text = "";
      try {
        text = await readFile(filePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const records: AuditRecord[] = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          records.push(JSON.parse(line) as AuditRecord);
        } catch {
          continue;
        }
      }
      return records.reverse().slice(0, 200);
    },
  };
}
