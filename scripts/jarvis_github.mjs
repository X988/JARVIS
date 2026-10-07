const [repo] = process.argv.slice(2);
const token = process.env.JARVIS_GITHUB_TOKEN?.trim();
const api = (process.env.JARVIS_GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
  process.stdout.write(JSON.stringify({ code: "NOT_CONFIGURED", detail: "invalid inventory repository" }));
  process.exit(0);
}
if (!token) {
  process.stdout.write(JSON.stringify({ code: "CREDENTIAL_UNAVAILABLE", detail: "JARVIS_GITHUB_TOKEN is not configured" }));
  process.exit(0);
}
const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "jarvis-control-plane",
};
async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(api + path, { headers, redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error(`github http ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
try {
  const runs = await get(`/repos/${repo}/actions/runs?per_page=1`);
  const run = Array.isArray(runs.workflow_runs) ? runs.workflow_runs[0] : null;
  if (!run) {
    process.stdout.write(JSON.stringify({ code: "VERIFICATION_FAILED", detail: "no workflow runs" }));
    process.exit(0);
  }
  const jobs = await get(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
  const failedJobs = (jobs.jobs || []).filter((job) => job.conclusion === "failure");
  const failedSteps = failedJobs.flatMap((job) =>
    (job.steps || []).filter((step) => step.conclusion === "failure").map((step) => `${job.name}:${step.name}`)
  );
  const prs = Array.isArray(run.pull_requests) ? run.pull_requests.map((pr) => pr.number) : [];
  process.stdout.write(JSON.stringify({
    code: "OK",
    detail: [
      `run=${run.id}`,
      `status=${run.status}`,
      `conclusion=${run.conclusion ?? "pending"}`,
      `sha=${run.head_sha}`,
      `branch=${run.head_branch}`,
      `prs=${prs.join(",") || "none"}`,
      `failed_jobs=${failedJobs.map((job) => job.name).join(",") || "none"}`,
      `failed_steps=${failedSteps.join(",") || "none"}`,
    ].join("; "),
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    code: error?.name === "AbortError" ? "EXECUTION_TIMEOUT" : "CONNECT_FAILED",
    detail: error instanceof Error ? error.message : "github request failed",
  }));
}
