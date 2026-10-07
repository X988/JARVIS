import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";

export type ScheduledTask = {
  id: string;
  text: string;
  timezone: string;
  cron: string;
  status: "active" | "paused" | "cancelled";
  history: { at: string; code: string }[];
};

type LocalClock = {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function scheduleFile(dir: string): string {
  return path.join(dir, "schedule.json");
}

export function loadTasks(dir: string): ScheduledTask[] {
  const target = scheduleFile(dir);
  if (!fs.existsSync(target)) return [];
  return JSON.parse(fs.readFileSync(target, "utf8")) as ScheduledTask[];
}

export function saveTasks(dir: string, tasks: ScheduledTask[]): void {
  withStateLock(dir, () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(scheduleFile(dir), JSON.stringify(tasks, null, 2));
  });
}

function localClock(now: Date, timezone: string): LocalClock | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hourCycle: "h23",
      minute: "2-digit",
      hour: "2-digit",
      day: "2-digit",
      month: "2-digit",
      weekday: "short",
    });
    const parts = Object.fromEntries(
      formatter
        .formatToParts(now)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    const dayOfWeek = WEEKDAY[parts.weekday ?? ""];
    const minute = Number(parts.minute);
    const hour = Number(parts.hour);
    const dayOfMonth = Number(parts.day);
    const month = Number(parts.month);
    if (
      dayOfWeek === undefined ||
      !Number.isInteger(minute) ||
      !Number.isInteger(hour) ||
      !Number.isInteger(dayOfMonth) ||
      !Number.isInteger(month)
    ) {
      return null;
    }
    return { minute, hour, dayOfMonth, month, dayOfWeek };
  } catch {
    return null;
  }
}

function cronMatch(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  if (!/^\d+$/.test(field)) return false;
  const expected = Number(field);
  return expected >= min && expected <= max && expected === value;
}

export function isTaskDue(task: ScheduledTask, now: Date): boolean {
  if (task.status !== "active") return false;
  const parts = task.cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const clock = localClock(now, task.timezone || "UTC");
  if (!clock) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    cronMatch(minute, clock.minute, 0, 59) &&
    cronMatch(hour, clock.hour, 0, 23) &&
    cronMatch(dayOfMonth, clock.dayOfMonth, 1, 31) &&
    cronMatch(month, clock.month, 1, 12) &&
    cronMatch(dayOfWeek, clock.dayOfWeek, 0, 6)
  );
}

function firedThisMinute(task: ScheduledTask, now: Date): boolean {
  const bucket = now.toISOString().slice(0, 16);
  return task.history.some((row) => row.at.slice(0, 16) === bucket);
}

export function runDue(
  dir: string,
  now: Date,
  run: (text: string) => { code: string },
): { id: string; code: string }[] {
  return withStateLock(dir, () => {
    const tasks = loadTasks(dir);
    const fired: { id: string; code: string }[] = [];
    for (const task of tasks) {
      if (!isTaskDue(task, now) || firedThisMinute(task, now)) continue;
      const result = run(task.text);
      task.history.push({ at: now.toISOString(), code: result.code });
      fired.push({ id: task.id, code: result.code });
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(scheduleFile(dir), JSON.stringify(tasks, null, 2));
    return fired;
  });
}
