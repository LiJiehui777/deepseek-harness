#!/usr/bin/env bash
# Resolve the enhanced deployment runtime without changing the system default.
enhanced_node="${DSH_ENHANCED_NODE:-node}"
if [[ -z "${DSH_ENHANCED_NODE:-}" && -x "$PWD/.local/runtime/node" ]]; then enhanced_node="$PWD/.local/runtime/node"; fi
"$enhanced_node" -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); const supported = (major === 24 && (minor > 22 || (minor === 22 && patch >= 3))) || major > 26 || (major === 26 && (minor > 13 || (minor === 13 && patch >= 1))); if (!supported) { console.error("DH enhanced requires Node.js ^24.22.3 or >=26.13.1. Set DSH_ENHANCED_NODE to a supported Node executable."); process.exit(1); }'
if [[ "$enhanced_node" == */* ]]; then export PATH="$(dirname "$enhanced_node"):$PATH"; fi
