#!/usr/bin/env bash
# CR-146 (KI-074): rebuilds the self-hosted .woff2 files in this directory from
# google/fonts sources, so `next build` never fetches fonts at build time.
# Not part of any build — run by hand only when a font/weight changes, then
# commit the output. Needs Python 3 with `fonttools` and `brotli`:
#   python3 -m venv .venv && .venv/bin/pip install fonttools brotli
#   PYTHON=.venv/bin/python ./build-fonts.sh
set -euo pipefail

# google/fonts commit the sources are pinned to (bump deliberately).
GOOGLE_FONTS_SHA=23e54b51ddffbc7713c583748e3bd86f62b1fa4a
PYTHON=${PYTHON:-python3}
OUT=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BASE="https://raw.githubusercontent.com/google/fonts/$GOOGLE_FONTS_SHA/ofl"

# Google Fonts' own `latin` + `cyrillic` subset ranges — the two subsets
# `next/font/google` loaded before (read from fonts.googleapis.com/css2).
LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
CYRILLIC='U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'

fetch() { # <dir> <file>
  curl -fsSL -o "$WORK/$2" "$BASE/$1/$(printf %s "$2" | sed 's/\[/%5B/;s/\]/%5D/')"
}

# <source ttf> <output name> [wght instance or range]
build() {
  local src="$WORK/$1" out="$2" wght="${3:-}" input
  input="$src"
  if [ -n "$wght" ]; then
    input="$WORK/$out.ttf"
    "$PYTHON" -m fontTools.varLib.instancer "$src" "wght=$wght" -o "$input" -q
  fi
  # `*` keeps every OpenType feature: Sofia Sans' Russian forms are its
  # `locl` feature (`<html lang="ru">`), tabular numerals are `tnum`.
  "$PYTHON" -m fontTools.subset "$input" \
    --unicodes="$LATIN,$CYRILLIC" \
    --layout-features='*' \
    --flavor=woff2 \
    --output-file="$OUT/$out.woff2"
}

fetch golostext 'GolosText[wght].ttf'
fetch sofiasansextracondensed 'SofiaSansExtraCondensed[wght].ttf'
fetch unbounded 'Unbounded[wght].ttf'
fetch ibmplexmono IBMPlexMono-Regular.ttf
fetch ibmplexmono IBMPlexMono-Medium.ttf

for w in 400 500 600 800; do build 'GolosText[wght].ttf' "GolosText-$w" "$w"; done
for w in 700 800; do
  build 'SofiaSansExtraCondensed[wght].ttf' "SofiaSansExtraCondensed-$w" "$w"
done
for w in 500 600 700; do build 'Unbounded[wght].ttf' "Unbounded-$w" "$w"; done
build IBMPlexMono-Regular.ttf IBMPlexMono-400
build IBMPlexMono-Medium.ttf IBMPlexMono-500

mkdir -p "$OUT/licenses"
for family in golostext sofiasansextracondensed unbounded ibmplexmono; do
  curl -fsSL -o "$OUT/licenses/OFL-$family.txt" "$BASE/$family/OFL.txt"
done
