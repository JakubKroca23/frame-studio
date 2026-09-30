#!/bin/sh
# Link the LibreDWG 0.13.4 wasm reader. Requires emsdk and a prior
# `emmake make -C src libredwg.la` in the configured build tree.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
LIB="${LIBREDWG_A:-/tmp/lwasm/src/.libs/libredwg.a}"
INC="${LIBREDWG_INC:-/tmp/libredwg-wasm-src/include}"
if [ ! -f "$LIB" ]; then
  echo "missing $LIB" >&2
  exit 1
fi
# shellcheck disable=SC1091
. /tmp/emsdk/emsdk_env.sh
emcc -O2 \
  -o "$ROOT/src/wasm/dwgfilter.js" \
  "$ROOT/vendor/dwgfilter.c" \
  "$LIB" \
  -I"$INC" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createDwgFilter \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=268435456 \
  -sMAXIMUM_MEMORY=2147418112 \
  -sEXPORTED_FUNCTIONS=_dwg_filtered_dxf,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=FS,UTF8ToString,stringToNewUTF8 \
  -sUSE_ZLIB=1 \
  -sENVIRONMENT=web,worker,node \
  -sSTACK_SIZE=8388608 \
  -sASSERTIONS=0
echo "wrote $ROOT/src/wasm/dwgfilter.js"
