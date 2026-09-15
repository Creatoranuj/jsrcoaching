#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

const capacitorCoreRange = deps["@capacitor/core"] ?? "";
const majorMatch = capacitorCoreRange.match(/\d+/);
const capacitorMajor = majorMatch ? Number(majorMatch[0]) : null;

if (!capacitorMajor) {
  console.error("❌ @capacitor/core is missing or has an unparsable version range.");
  process.exit(1);
}

const failures = [];

function getMinimumPeerMajor(peerRange) {
  if (!peerRange) return null;
  const versionMatches = [...String(peerRange).matchAll(/(\d+)\.(\d+)\.(\d+)/g)].map((match) => Number(match[1]));
  return versionMatches.length ? Math.min(...versionMatches) : null;
}

for (const name of Object.keys(deps).sort()) {
  if (!name.startsWith("@capacitor/") && !name.startsWith("@capacitor-community/") && !name.startsWith("capacitor-")) {
    continue;
  }

  const manifestPath = path.join(root, "node_modules", name, "package.json");
  if (!fs.existsSync(manifestPath)) {
    failures.push(`${name}: installed package is missing from node_modules; run bun install/npm install first.`);
    continue;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const peerRange = manifest.peerDependencies?.["@capacitor/core"];
  const minimumPeerMajor = getMinimumPeerMajor(peerRange);
  if (minimumPeerMajor && minimumPeerMajor > capacitorMajor) {
    failures.push(`${name}@${manifest.version}: peer @capacitor/core ${peerRange}, but project uses ${capacitorCoreRange}.`);
  }
}

if (failures.length) {
  console.error("❌ Capacitor plugin version mismatch detected:");
  for (const failure of failures) console.error(` - ${failure}`);
  console.error("Fix: install the plugin major that matches the project Capacitor major, then run npx cap sync.");
  process.exit(1);
}

console.log(`✅ Capacitor plugin peer ranges are compatible with @capacitor/core ${capacitorCoreRange}.`);