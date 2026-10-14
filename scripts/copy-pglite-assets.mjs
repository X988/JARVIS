import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ASSETS = ["pglite.data", "pglite.wasm", "initdb.wasm"];

/** Nitro bundles the JS, but PGlite resolves its WASM/data beside that bundle. */
export function copyPgliteAssets({ sourceDir, outputDir }) {
  const destinations = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /^electric-sql__pglite(?:[-.].*)?\.mjs$/.test(entry.name)) destinations.push(dir);
    }
  }
  walk(outputDir);
  if (!destinations.length) throw new Error("PGlite server bundle not found; packaging layout needs review");
  for (const name of ASSETS) {
    const source = path.join(sourceDir, name);
    if (!fs.statSync(source).isFile()) throw new Error(`PGlite asset missing: ${name}`);
    for (const destination of new Set(destinations)) fs.copyFileSync(source, path.join(destination, name));
  }
  return [...new Set(destinations)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const require = createRequire(import.meta.url);
  const destinations = copyPgliteAssets({
    sourceDir: path.dirname(require.resolve("@electric-sql/pglite")),
    outputDir: path.join(root, ".vercel/output"),
  });
  console.log(`PGlite runtime assets packaged into ${destinations.length} server bundle(s)`);
}
