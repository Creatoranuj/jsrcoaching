#!/usr/bin/env bash
# Phase B1 — AVIF encoder
# Usage: ./scripts/encode-avif.sh <input.png|input.webp> [output.avif]
# Requires: nix (libavif + libwebp) — installed on demand
set -euo pipefail

AVIFENC_PKG=$(nix build nixpkgs#libavif --no-link --print-out-paths 2>/dev/null)
DWEBP_PKG=$(nix build nixpkgs#libwebp --no-link --print-out-paths 2>/dev/null)
AVIFENC="$AVIFENC_PKG/bin/avifenc"
DWEBP="$DWEBP_PKG/bin/dwebp"

# Quality preset matching Phase B1 audit: --min 30 --max 45 -s 4
# Average savings vs WebP@82: ~47% on landing imagery.
QMIN=${QMIN:-30}
QMAX=${QMAX:-45}
SPEED=${SPEED:-4}

input="$1"
output="${2:-${input%.*}.avif}"

case "$input" in
  *.webp)
    tmp=$(mktemp --suffix=.png)
    trap "rm -f $tmp" EXIT
    "$DWEBP" "$input" -o "$tmp" >/dev/null 2>&1
    "$AVIFENC" --min "$QMIN" --max "$QMAX" -s "$SPEED" -j all "$tmp" "$output" >/dev/null
    ;;
  *.png|*.jpg|*.jpeg)
    "$AVIFENC" --min "$QMIN" --max "$QMAX" -s "$SPEED" -j all "$input" "$output" >/dev/null
    ;;
  *)
    echo "Unsupported input: $input" >&2; exit 1;;
esac

orig=$(stat -c%s "$input"); new=$(stat -c%s "$output")
pct=$(( (orig - new) * 100 / orig ))
printf "%s: %d -> %d bytes (%d%% smaller)\n" "$(basename "$output")" "$orig" "$new" "$pct"
