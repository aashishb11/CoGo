#!/usr/bin/env bash
# Renders every .mmd in src/ to out/ as both SVG (vector) and PNG (16:9 raster).
# Uses local Chrome so puppeteer doesn't download a second Chromium.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/src"
OUT="$HERE/out"
CFG="$HERE/mermaid.config.json"
PUP="$HERE/puppeteer.config.json"

mkdir -p "$OUT"

# Use the on-demand cli; pnpm caches it in the global store after the first run.
MMDC=(pnpm dlx --silent @mermaid-js/mermaid-cli@10.9.1)

# 16:9 canvas. mmdc uses these as the viewport; the SVG self-sizes to content
# and the PNG is rasterised at this exact size.
WIDTH=1920
HEIGHT=1080

shopt -s nullglob
for src in "$SRC"/*.mmd; do
  base="$(basename "$src" .mmd)"
  echo "→ $base"

  "${MMDC[@]}" \
    --input "$src" \
    --output "$OUT/$base.svg" \
    --configFile "$CFG" \
    --puppeteerConfigFile "$PUP" \
    --backgroundColor white \
    --width "$WIDTH" --height "$HEIGHT"

  "${MMDC[@]}" \
    --input "$src" \
    --output "$OUT/$base.png" \
    --configFile "$CFG" \
    --puppeteerConfigFile "$PUP" \
    --backgroundColor white \
    --width "$WIDTH" --height "$HEIGHT" \
    --scale 2
done

echo
echo "Done. Outputs in $OUT"
ls -lh "$OUT"
