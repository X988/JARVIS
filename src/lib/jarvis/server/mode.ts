import { configProblems } from "./config";


export type Mode = "dry-run" | "mock" | "real";

export interface EffectiveMode {
  mode: Mode;
  requested: Mode;
  degraded: boolean;
  reasons: string[];
}

export function effectiveExecutionMode(env: NodeJS.ProcessEnv = process.env): EffectiveMode {
  const raw = env.EXECUTION_MODE;
  const requested: Mode = raw === "real" || raw === "mock" || raw === "dry-run" ? raw : "dry-run";
  const problems = configProblems();
  if (requested === "real" && problems.length > 0) {
    return {
      mode: "dry-run",
      requested,
      degraded: true,
      reasons: problems,
    };
  }
  return { mode: requested, requested, degraded: false, reasons: [] };
}

/** Explicit mode from channel is allowed only if not higher than effective. */
export function modeOf(explicit: Mode | undefined, env: NodeJS.ProcessEnv = process.env): Mode {
  const effective = effectiveExecutionMode(env);
  if (!explicit) return effective.mode;
  const rank = { "dry-run": 0, mock: 1, real: 2 } as const;
  if (rank[explicit] > rank[effective.mode]) return effective.mode;
  return explicit;
}
