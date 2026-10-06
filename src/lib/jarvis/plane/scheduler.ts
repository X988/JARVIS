import fs from "node:fs";
import path from "node:path";

export type ScheduledTask = {
  id: string;
  text: string;
  timezone: string;
  cron: string;
  status: "active" | "paused" | "cancelled";
  history: { at: string; code: string }[];
};

function file(dir: string): string {
  return path.join(dir, "schedule.json");
}

export function loadTasks(dir: string): ScheduledTask[] {
  const target = file(dir);
  if (!fs.existsSync(target)) return [];
  return JSON.parse(fs.readFileSync(target, "utf8")) as ScheduledTask[];
}

export function saveTasks(dir: string, tasks: ScheduledTask[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify(tasks, null, 2));
}

export function due(task: ScheduledTask, now: Date): boolean {
  if (task.status !== "active") return false;
  const parts = task.cron.split(" ");
  if (parts.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const matches = (field: string, value: number) => field === "*" || Number(field) === value;
  return (
    matches(minute, now.getUTCMinutes()) &&
    matches(hour, now.getUTCHours()) &&
    matches(dayOfMonth, now.getUTCDate()) &&
    matches(month, now.getUTCMonth() + 1) &&
    matches(dayOfWeek, now.getUTCDay())
  );
}

export function runDue(
  dir: string,
  now: Date,
  run: (text: string) => { code: string },
): { id: string; code: string }[] {
  const tasks = loadTasks(dir);
  const fired: { id: string; code: string }[] = [];
  for (const task of tasks) {
    if (!due(task, now)) continue;
    const result = run(task.text);
    task.history.push({ at: now.toISOString(), code: result.code });
    fired.push({ id: task.id, code: result.code });
  }
  saveTasks(dir, tasks);
  return fired;
}
