#!/bin/bash
# CloudCAD offline pnpm entry
# Only effective in project directory, does not affect system pnpm

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer linux runtime, fallback to windows
if [ -f "$SCRIPT_DIR/runtime/linux/node/bin/node" ]; then
  export PATH="$SCRIPT_DIR/runtime/linux/node/bin:$PATH"
  exec pnpm "$@"
elif [ -f "$SCRIPT_DIR/runtime/windows/node/node.exe" ]; then
  NODE="$SCRIPT_DIR/runtime/windows/node/node.exe"
  PNPM_CJS="$SCRIPT_DIR/runtime/windows/node/node_modules/pnpm/bin/pnpm.cjs"
  exec "$NODE" "$PNPM_CJS" "$@"
fi

echo "Error: No runtime node found" >&2
exit 1
