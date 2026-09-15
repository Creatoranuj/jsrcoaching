#!/usr/bin/env node
/**
 * Lockfile registry guard.
 *
 * Sandboxed dev environments proxy npm through private hosts:
 *   - Replit  → http://package-firewall.replit.local/npm/...
 *   - Lovable → https://<region>-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...
 *
 * When an install runs there, those ABSOLUTE tarball URLs get written into
 * bun.lock / package-lock.json and committed. GitHub Actions runners cannot
 * resolve them, so `bun install` dies with ConnectionRefused /
 * FailedToOpenSocket and the npm fallback dies with EAI_AGAIN — on the same
 * handful of packages, every retry. It looks like a transient registry blip
 * but it is 100 % reproducible.
 *
 * This guard fails the build the moment such a URL lands in a lockfile.
 *
 * Usage: node scripts/check-lockfile-registry.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const LOCKFILES = ['bun.lock', 'bun.lockb', 'package-lock.json'];

/** Hosts that are unreachable outside a specific sandbox. */
const FORBIDDEN = [
  { label: 'Replit package firewall', re: /https?:\/\/[^"'\s]*replit\.local[^"'\s]*/g },
  { label: 'Lovable sandbox npm mirror', re: /https?:\/\/[a-z0-9-]+-npm\.pkg\.dev\/[^"'\s]*/g },
];

let failed = false;

for (const file of LOCKFILES) {
  if (!existsSync(file)) continue;

  if (file.endsWith('.lockb')) {
    console.error(
      `❌ ${file}: binary lockfile committed. Regenerate as text with ` +
        '`bun install --save-text-lockfile` so it can be audited and scanned.',
    );
    failed = true;
    continue;
  }

  const content = readFileSync(file, 'utf8');
  for (const { label, re } of FORBIDDEN) {
    const hits = content.match(re);
    if (!hits) continue;
    const unique = [...new Set(hits)];
    console.error(
      `❌ ${file}: ${hits.length} tarball URL(s) point at ${label} — unreachable from CI.`,
    );
    for (const url of unique.slice(0, 3)) console.error(`     ${url}`);
    if (unique.length > 3) console.error(`     …and ${unique.length - 3} more`);
    failed = true;
  }
}

if (failed) {
  console.error('');
  console.error('Fix: regenerate the lockfiles against the public registry.');
  console.error('  rm -f bun.lock bun.lockb package-lock.json');
  console.error('  BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun install --save-text-lockfile');
  console.error('  npm install --package-lock-only --registry=https://registry.npmjs.org');
  console.error('(.npmrc + bunfig.toml already pin the public registry — keep them.)');
  process.exit(1);
}

console.log('✅ Lockfiles resolve only from the public npm registry.');
