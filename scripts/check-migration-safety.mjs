#!/usr/bin/env node
// Replay-safety lint for supabase/migrations (no deps, no database).
// Flags DROP POLICY/FUNCTION/TRIGGER/INDEX/VIEW/TYPE without IF EXISTS in
// migrations at or after STRICT_FROM. Older files are grandfathered.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] || 'supabase/migrations';
const STRICT_FROM = '20260801060000';
const KINDS = ['POLICY', 'FUNCTION', 'TRIGGER', 'INDEX', 'VIEW', 'TYPE'];
const strip = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '')
     .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (m) => m.replace(/[^\n]/g, ' '));

let errors = 0, checked = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort()) {
  if (f.slice(0, 14) < STRICT_FROM) continue;
  checked++;
  const sql = strip(readFileSync(join(DIR, f), 'utf8'));
  const lines = sql.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/\bDROP\s+(POLICY|FUNCTION|TRIGGER|INDEX|VIEW|TYPE)\b(?!\s+IF\s+EXISTS)/i);
    if (m && KINDS.includes(m[1].toUpperCase())) {
      errors++;
      console.log(`::error file=${DIR}/${f},line=${i + 1}::DROP ${m[1].toUpperCase()} without IF EXISTS (not replay-safe)`);
    }
  });
}
console.log(`Checked ${checked} strict migration(s): ${errors} error(s).`);
process.exit(errors ? 1 : 0);
