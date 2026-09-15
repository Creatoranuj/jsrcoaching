#!/usr/bin/env node
/**
 * Lockfile registry AUTO-REPAIR (companion to check-lockfile-registry.mjs).
 *
 * Sandboxed dev environments (Replit, Lovable) proxy npm through private hosts
 * and bake ABSOLUTE tarball URLs into bun.lock / package-lock.json:
 *
 *   http://package-firewall.replit.local/npm/<pkg>/-/<file>.tgz
 *   https://<region>-npm.pkg.dev/<proj>/sandbox-npm-cache/<pkg>/-/<file>.tgz
 *
 * Those hosts are unreachable from GitHub Actions, so every CI install dies
 * with ConnectionRefused / EAI_AGAIN. The mapping back to the public registry
 * is purely mechanical — same tarball bytes, so `integrity` hashes stay valid
 * and the dependency tree does not change.
 *
 * This script rewrites them in place. It is idempotent and exits 0 when there
 * is nothing to do, so it is safe to run from `postinstall` and from CI.
 *
 * Usage:
 *   node scripts/fix-lockfile-registry.mjs [--quiet] [--check]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PUBLIC_REGISTRY = 'https://registry.npmjs.org';
const LOCKFILES = ['bun.lock', 'package-lock.json'];

const args = new Set(process.argv.slice(2));
const QUIET = args.has('--quiet');
const CHECK_ONLY = args.has('--check');

/**
 * Each rule maps a private-host tarball URL to its public-registry equivalent.
 * Capture group 1 must be the registry-relative path (`<pkg>/-/<file>.tgz`,
 * including any `@scope/` prefix).
 */
const RULES = [
  {
    label: 'Replit package firewall',
    // http://package-firewall.replit.local/npm/<path>
    re: /https?:\/\/[^"'\s]*replit\.local\/npm\/([^"'\s]+)/g,
  },
  {
    label: 'Lovable sandbox npm mirror',
    // https://<region>-npm.pkg.dev/<project>/<repo>/<path>
    re: /https?:\/\/[a-z0-9-]+-npm\.pkg\.dev\/[^/"'\s]+\/[^/"'\s]+\/([^"'\s]+)/g,
  },
];

const log = (...a) => {
  if (!QUIET) console.log(...a);
};

let totalRewrites = 0;
let hardFailure = false;

if (existsSync('bun.lockb')) {
  console.error(
    '❌ bun.lockb: binary lockfile committed — cannot be repaired textually.\n' +
      '   Regenerate as text: bun install --save-text-lockfile',
  );
  hardFailure = true;
}

for (const file of LOCKFILES) {
  if (!existsSync(file)) continue;

  const original = readFileSync(file, 'utf8');
  let content = original;
  let fileRewrites = 0;
  const touched = new Set();

  for (const { label, re } of RULES) {
    content = content.replace(re, (match, relPath) => {
      fileRewrites += 1;
      touched.add(`${relPath.split('/-/')[0]} (${label})`);
      return `${PUBLIC_REGISTRY}/${relPath}`;
    });
  }

  if (fileRewrites === 0) continue;

  totalRewrites += fileRewrites;

  if (CHECK_ONLY) {
    console.error(`❌ ${file}: ${fileRewrites} private-registry URL(s) need repair.`);
    for (const pkg of touched) console.error(`     ${pkg}`);
    continue;
  }

  writeFileSync(file, content);
  console.log(`🔧 ${file}: rewrote ${fileRewrites} URL(s) to ${PUBLIC_REGISTRY}`);
  for (const pkg of touched) console.log(`     ${pkg}`);
}

if (hardFailure) process.exit(1);

if (totalRewrites === 0) {
  log('✅ Lockfiles already resolve only from the public npm registry.');
  process.exit(0);
}

if (CHECK_ONLY) {
  console.error('\nFix: bun run fix:lockfile   (then commit the lockfiles)');
  process.exit(1);
}

// Signal to CI that a repair happened, without failing the build.
console.log(`\n♻️  Repaired ${totalRewrites} private-registry URL(s). Commit the lockfiles.`);
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `repaired=${totalRewrites}\n`, { flag: 'a' });
}
process.exit(0);