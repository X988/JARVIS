const STEPS = ["plan", "branch", "workspace", "patch", "bsl", "tests", "diff", "approval", "commit", "pr"] as const;

export function planGitFlow(input: { pushMain: boolean }): { ok: boolean; code: "OK" | "DENY"; steps: string[]; message: string } {
  if (input.pushMain) {
    return { ok: false, code: "DENY", steps: [], message: "Прямой push в main запрещён." };
  }
  return { ok: true, code: "OK", steps: [...STEPS], message: "Сначала ветка и diff. В main само не попадает." };
}
