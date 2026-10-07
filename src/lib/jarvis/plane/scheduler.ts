import fs from "node:fs";
import path from "node:path";
import { withStateLock } from "../server/state-lock.ts";

export type TaskStatus = "active" | "paused" | "cancelled" | "completed";

export type ScheduledTask = {
  id: string;
  text: string;
  timezone: string;
  cron?: string;
  runAt?: string;
  status: TaskStatus;
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

function atomicSave(dir: string, tasks: ScheduledTask[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = scheduleFile(dir);
  const temp = target + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(tasks, null, 2));
  fs.renameSync(temp, target);
}

export function loadTasks(dir: string): ScheduledTask[] {
  const target = scheduleFile(dir);
  if (!fs.existsSync(target)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as ScheduledTask[]) : [];
  } catch {
    return [];
  }
}

export function saveTasks(dir: string, tasks: ScheduledTask[]): void {
  withStateLock(dir, () => atomicSave(dir, tasks));
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
    ) return null;
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

function recurringDue(task: ScheduledTask, now: Date): boolean {
  if (!task.cron) return false;
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

function oneTimeDue(task: ScheduledTask, now: Date): boolean {
  if (!task.runAt || task.history.length > 0) return false;
  const at = Date.parse(task.runAt);
  return Number.isFinite(at) && at <= now.getTime();
}

export function isTaskDue(task: ScheduledTask, now: Date): boolean {
  if (task.status !== "active") return false;
  return task.runAt ? oneTimeDue(task, now) : recurringDue(task, now);
}

function firedThisMinute(task: ScheduledTask, now: Date): boolean {
  const bucket = now.toISOString().slice(0, 16);
  return task.history.some((row) => row.at.slice(0, 16) === bucket);
}

export function createOneTimeTask(input: {
  id: string;
  text: string;
  runAt: string;
  timezone?: string;
}): ScheduledTask | null {
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(input.id) || !input.text.trim() || !Number.isFinite(Date.parse(input.runAt))) {
    return null;
  }
  return {
    id: input.id,
    text: input.text.trim(),
    timezone: input.timezone || "UTC",
    runAt: new Date(input.runAt).toISOString(),
    status: "active",
    history: [],
  };
}

export function createRecurringTask(input: {
  id: string;
  text: string;
  cron: string;
  timezone: string;
}): ScheduledTask | null {
  const candidate: ScheduledTask = {
    id: input.id,
    text: input.text.trim(),
    timezone: input.timezone,
    cron: input.cron.trim(),
    status: "active",
    history: [],
  };
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(input.id) || !candidate.text || !localClock(new Date(), input.timezone)) return null;
  const parts = candidate.cron?.split(/\s+/) ?? [];
  if (parts.length !== 5) return null;
  const probes = [
    cronMatch(parts[0], 0, 0, 59) || parts[0] === "*",
    cronMatch(parts[1], 0, 0, 23) || parts[1] === "*",
    cronMatch(parts[2], 1, 1, 31) || parts[2] === "*",
    cronMatch(parts[3], 1, 1, 12) || parts[3] === "*",
    cronMatch(parts[4], 0, 0, 6) || parts[4] === "*",
  ];
  return probes.every(Boolean) ? candidate : null;
}

function changeStatus(dir: string, id: string, next: "paused" | "cancelled" | "active"): ScheduledTask | null {
  return withStateLock(dir, () => {
    const tasks = loadTasks(dir);
    const task = tasks.find((item) => item.id === id);
    if (!task || task.status === "completed" || task.status === "cancelled") return null;
    if (next === "active" && task.status !== "paused") return null;
    task.status = next;
    atomicSave(dir, tasks);
    return { ...task, history: [...task.history] };
  });
}

export function pauseTask(dir: string, id: string): ScheduledTask | null {
  return changeStatus(dir, id, "paused");
}

export function resumeTask(dir: string, id: string): ScheduledTask | null {
  return changeStatus(dir, id, "active");
}

export function cancelTask(dir: string, id: string): ScheduledTask | null {
  return changeStatus(dir, id, "cancelled");
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
      if (task.runAt) task.status = "completed";
      fired.push({ id: task.id, code: result.code });
    }
    atomicSave(dir, tasks);
    return fired;
  });
}
