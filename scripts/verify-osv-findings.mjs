#!/usr/bin/env node
/**
 * Cross-checks OSV.dev findings against the *actually installed* packages
 * (package.json + lockfile). Fails CI when:
 *   1. A reported vulnerability targets a package that is NOT present in the
 *      project — this catches stale/phantom findings from the scanner or a
 *      supply-chain provider that references a package the app never pulls in
 *      (e.g. the historical `@tanstack/react-start` / `js-yaml` false positive).
 *   2. A real HIGH/CRITICAL vulnerability is found in an installed package.
 *
 * Exit codes:
 *   0 — no findings, or all findings are informational (LOW/MODERATE) and match
 *       real packages.
 *   1 — phantom finding (mismatch with lockfile) or unresolved HIGH/CRITICAL.
 *   2 — network / OSV outage; treated as non-fatal warning by the CI wrapper.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN  = (id) => `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`;

/** Collect every package name+version present in the tree. */
function collectInstalled() {
  const installed = new Map(); // name -> Set<version>
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const [name, version] of Object.entries(declared)) {
    installed.set(name, new Set([String(version).replace(/^[\^~>=<]+/, '').trim()]));
  }

  // Enrich with the full transitive tree from bun / npm.
  let treeOut = '';
  try {
    treeOut = execSync('bun pm ls --all', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    try {
      treeOut = execSync('npm ls --all --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const json = JSON.parse(treeOut);
      const walk = (node) => {
        for (const [name, meta] of Object.entries(node.dependencies || {})) {
          const v = String(meta.version || '').trim();
          if (!v) continue;
          if (!installed.has(name)) installed.set(name, new Set());
          installed.get(name).add(v);
          walk(meta);
        }
      };
      walk(json);
      return installed;
    } catch {
      return installed;
    }
  }

  const re = /(@?[\w\-./]+)@([^\s]+)$/;
  for (const line of treeOut.split('\n')) {
    const m = re.exec(line.trim());
    if (!m) continue;
    const [, name, version] = m;
    if (!installed.has(name)) installed.set(name, new Set());
    installed.get(name).add(version);
  }
  return installed;
}

async function queryOsvBatch(packages) {
  const queries = packages.map(([name, versions]) => ({
    package: { name, ecosystem: 'npm' },
    version: [...versions][0],
  }));
  const res = await fetch(OSV_BATCH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ queries }),
  });
  if (!res.ok) throw new Error(`osv batch ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchVuln(id) {
  try {
    const res = await fetch(OSV_VULN(id));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function affectedPackageNames(vuln) {
  return new Set((vuln?.affected || [])
    .map((a) => a?.package?.name)
    .filter((n) => typeof n === 'string'));
}

function severityOf(vuln) {
  const dbSev = vuln?.database_specific?.severity;
  if (dbSev) return String(dbSev).toUpperCase();
  const cvss = vuln?.severity?.find((s) => String(s.type).startsWith('CVSS'))?.score;
  const num = cvss ? parseFloat(String(cvss).split('/').pop()) : NaN;
  if (!isNaN(num)) {
    if (num >= 9) return 'CRITICAL';
    if (num >= 7) return 'HIGH';
    if (num >= 4) return 'MODERATE';
    if (num > 0) return 'LOW';
  }
  return 'UNKNOWN';
}

async function main() {
  if (!existsSync('package.json')) {
    console.error('package.json missing');
    process.exit(2);
  }
  const installed = collectInstalled();
  const pkgs = [...installed.entries()];
  console.log(`[osv] scanning ${pkgs.length} packages`);

  let batchResults;
  try {
    batchResults = await queryOsvBatch(pkgs);
  } catch (err) {
    console.warn(`::warning::osv.dev unavailable: ${err.message} — treating as informational`);
    process.exit(2);
  }

  const findings = [];
  batchResults.forEach((r, idx) => {
    (r?.vulns || []).forEach((v) => findings.push({ pkg: pkgs[idx][0], id: v.id }));
  });

  const uniqueIds = [...new Set(findings.map((f) => f.id))];
  const details = new Map();
  for (let i = 0; i < uniqueIds.length; i += 8) {
    const chunk = uniqueIds.slice(i, i + 8);
    const results = await Promise.all(chunk.map(fetchVuln));
    chunk.forEach((id, j) => results[j] && details.set(id, results[j]));
  }

  const phantoms = [];
  const real = [];
  for (const f of findings) {
    const d = details.get(f.id);
    const affected = d ? affectedPackageNames(d) : new Set([f.pkg]);
    // "phantom" = OSV says this vuln affects a package that our lockfile does
    // not actually contain (mismatch = stale/incorrect finding).
    const matched = [...affected].some((name) => installed.has(name));
    if (!matched) {
      phantoms.push({ ...f, affected: [...affected], summary: d?.summary || '' });
    } else {
      real.push({ ...f, severity: severityOf(d), summary: d?.summary || '' });
    }
  }

  console.log(`[osv] findings: ${findings.length} (real=${real.length}, phantom=${phantoms.length})`);

  if (phantoms.length) {
    console.error('\n❌ Phantom findings — reported package is NOT in lockfile:');
    for (const p of phantoms) {
      console.error(`  - ${p.id}: affects ${p.affected.join(', ')} — ${p.summary}`);
    }
  }

  const blocking = real.filter((r) => r.severity === 'HIGH' || r.severity === 'CRITICAL');
  if (blocking.length) {
    console.error('\n❌ Unresolved HIGH/CRITICAL findings:');
    for (const r of blocking) {
      console.error(`  - [${r.severity}] ${r.pkg} — ${r.id}: ${r.summary}`);
    }
  }

  if (phantoms.length || blocking.length) process.exit(1);
  if (real.length) {
    console.log('\n⚠️  Informational (LOW/MODERATE) findings:');
    for (const r of real) console.log(`  - [${r.severity}] ${r.pkg} — ${r.id}`);
  } else {
    console.log('✅ No findings.');
  }
}

main().catch((err) => {
  console.error('verify-osv-findings failed:', err);
  process.exit(2);
});