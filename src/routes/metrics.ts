import { createFileRoute } from "@tanstack/react-router";
import path from "node:path";
import { loadAuditOutbox } from "@/lib/jarvis/audit-outbox";
import { renderPrometheus, type PrometheusGauge } from "@/lib/jarvis/metrics";
import { adapterStatus } from "@/lib/jarvis/server/adapters";
import { probeViews } from "@/lib/jarvis/server/probe-status";

function stateDir(): string {
  return path.resolve(process.env.JARVIS_STATE_DIR || path.join(process.cwd(), "data"));
}

function adapterValue(status: string): number {
  if (status === "HEALTHY") return 1;
  if (status === "DEGRADED" || status === "UNAVAILABLE") return -1;
  return 0;
}

export const Route = createFileRoute("/metrics")({
  server: {
    handlers: {
      GET: async () => {
        const dir = stateDir();
        const passive = adapterStatus(process.env);
        const probes = probeViews(passive, dir);
        const gauges: PrometheusGauge[] = [];

        for (const [adapter, probe] of Object.entries(probes)) {
          gauges.push({
            name: "jarvis_adapter_health",
            value: adapterValue(probe.status),
            labels: { adapter },
          });
          gauges.push({
            name: "jarvis_adapter_last_success_timestamp",
            value: probe.lastSuccessAt ? probe.lastSuccessAt / 1000 : 0,
            labels: { adapter },
          });
        }

        let pending = -1;
        try {
          pending = loadAuditOutbox(dir).length;
        } catch {
          pending = -1;
        }
        gauges.push({
          name: "jarvis_audit_outbox_pending",
          value: pending,
          help: "Pending external audit envelopes; -1 means state could not be read.",
        });

        const mode =
          process.env.EXECUTION_MODE === "real" || process.env.EXECUTION_MODE === "mock"
            ? process.env.EXECUTION_MODE
            : "dry-run";
        gauges.push({
          name: "jarvis_runtime_info",
          value: 1,
          labels: {
            mode,
            profile: process.env.JARVIS_PROFILE === "production-infra" ? "production-infra" : "demo",
          },
        });

        return new Response(renderPrometheus(gauges), {
          status: 200,
          headers: {
            "content-type": "text/plain; version=0.0.4; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
