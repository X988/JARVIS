import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanText } from "./check-secrets.mjs";

function semver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function gitSha(root, env) {
  const configured = env.GITHUB_SHA?.trim();
  if (configured && /^[a-f0-9]{40}$/i.test(configured)) return configured.toLowerCase();
  const value = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!/^[a-f0-9]{40}$/i.test(value)) throw new Error("release commit SHA unavailable");
  return value.toLowerCase();
}

function scanBuildOutput(root) {
  const findings = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const buffer = fs.readFileSync(full);
        if (buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0)) continue;
        for (const kind of scanText(buffer.toString("utf8"))) {
          findings.push({ file: path.relative(root, full), kind });
        }
      }
    }
  };
  walk(root);
  return findings;
}

export function buildManifest({ artifact, version, commit }) {
  const stat = fs.statSync(artifact);
  if (!stat.isFile()) throw new Error("release artifact is not a file");
  if (!semver(version)) throw new Error("invalid release version");
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error("invalid release commit");
  return {
    schemaVersion: 1,
    project: "corporate-jarvis-control-plane",
    version,
    commit: commit.toLowerCase(),
    artifact: path.basename(artifact),
    sha256: sha256(artifact),
    sizeBytes: stat.size,
    status: "pre-production",
  };
}

export function verifyManifest(manifest, artifact) {
  return Boolean(
    manifest &&
      manifest.schemaVersion === 1 &&
      manifest.artifact === path.basename(artifact) &&
      /^[a-f0-9]{64}$/.test(manifest.sha256) &&
      manifest.sha256 === sha256(artifact) &&
      manifest.sizeBytes === fs.statSync(artifact).size &&
      semver(manifest.version) &&
      /^[a-f0-9]{40}$/.test(manifest.commit) &&
      manifest.status === "pre-production",
  );
}

function main() {
  const root = process.cwd();
  const output = path.join(root, ".vercel", "output");
  if (!fs.existsSync(output) || !fs.statSync(output).isDirectory()) {
    throw new Error("build output .vercel/output is missing");
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const version = String(packageJson.version ?? "");
  if (!semver(version)) throw new Error("package.json version is not SemVer");

  const findings = scanBuildOutput(output);
  if (findings.length) {
    for (const finding of findings) {
      process.stderr.write(`release secret scan: ${finding.file}: ${finding.kind}\n`);
    }
    throw new Error("build output contains secret-like material");
  }

  const commit = gitSha(root, process.env);
  const releaseDir = path.join(root, "release");
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  const artifact = path.join(
    releaseDir,
    `jarvis-${version}-${commit.slice(0, 12)}.tar.gz`,
  );

  const tar = spawnSync(
    "tar",
    [
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-czf",
      artifact,
      ".vercel/output",
      "package.json",
      "package-lock.json",
      "config/jarvis/env.schema.json",
      "docs/RELEASE_CHECKLIST.md",
      "docs/BACKUP.md",
    ],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  if (tar.status !== 0) {
    throw new Error(`release tar failed: ${tar.stderr || tar.error?.message || "unknown"}`);
  }

  const manifest = buildManifest({ artifact, version, commit });
  const manifestFile = path.join(releaseDir, "deployment-manifest.json");
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(
    path.join(releaseDir, `${manifest.artifact}.sha256`),
    `${manifest.sha256}  ${manifest.artifact}\n`,
  );
  if (!verifyManifest(manifest, artifact)) throw new Error("release manifest verification failed");
  process.stdout.write(`release artifact: ${manifest.artifact}\nsha256: ${manifest.sha256}\n`);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) main();
