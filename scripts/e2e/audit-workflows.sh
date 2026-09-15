#!/usr/bin/env bash
# Local E2E audit harness — validates every workflow WITHOUT hitting GitHub.
# Runs YAML parse + actionlint + shellcheck against .github/workflows/*.yml.
# Usage: bash scripts/e2e/audit-workflows.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== 1) YAML parse (11 workflows) =="
python3 - <<'PY'
import glob, sys, yaml
fail = 0
for f in sorted(glob.glob(".github/workflows/*.yml")):
    try:
        yaml.safe_load(open(f))
        print(f"  OK  {f}")
    except Exception as e:
        print(f"  ERR {f}: {e}"); fail += 1
sys.exit(fail)
PY

echo
echo "== 2) actionlint (+shellcheck) =="
if command -v actionlint >/dev/null; then
  actionlint -no-color -oneline .github/workflows/*.yml || true
else
  nix run nixpkgs#actionlint -- -no-color -oneline .github/workflows/*.yml || true
fi

echo
echo "== 3) signature scan (ci-e2e-error-monitor S1/S2/S3) =="
# S1 — pipefail under sh/dash (only inside android-emulator-runner script:)
if grep -nE 'script:\s*\|.*set -o pipefail' .github/workflows/*.yml; then
  echo "::warning:: S1 candidate — pipefail in dash-invoked script block"
fi
# S2 — deprecated artifact actions
if grep -nE 'artifact@v[1-5]([^0-9]|$)' .github/workflows/*.yml; then
  echo "::warning:: S2 — artifact action on Node 20 (deprecated)"
fi
# S3 — Maestro credentials referenced but env block missing on that step
grep -RnE '\$\{?MAESTRO_(EMAIL|PASSWORD)' .github/workflows/*.yml || true

echo
echo "== 4) Maestro flow parse =="
for f in maestro/*.yaml maestro/split-smoke/*.yaml; do
  [ -f "$f" ] || continue
  python3 -c "import yaml; list(yaml.safe_load_all(open('$f'))); print('  OK  $f')" \
    || echo "  ERR $f"
done

echo
echo "Done. Zero output above = clean. Any '::warning::' or 'ERR' = fix before pushing a tag."