#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DSH_HOME="${DSH_ENHANCED_HOME:-$PWD/.local/enhanced-home}"
exec node --import tsx/esm apps/cli/src/bin.ts --profile web --patch "$PWD/apps/cli/config/examples/ragflow/cordis.yml" --host 127.0.0.1 --port "${DSH_ENHANCED_PORT:-3001}" --no-open "$@"
