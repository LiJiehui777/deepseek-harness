#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/enhanced-node.sh
export DSH_CLIENT_BUILD_PROFILE=ztt
export DSH_CLIENT_TITLE=中天质量智能体
exec "$enhanced_node" --import tsx/esm scripts/build.ts "$@"
