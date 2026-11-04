#!/usr/bin/env bash
# Resolve the enhanced deployment runtime without changing the system default.
enhanced_node="${DSH_ENHANCED_NODE:-node}"
if [[ -z "${DSH_ENHANCED_NODE:-}" && -x "$PWD/.local/runtime/node" ]]; then enhanced_node="$PWD/.local/runtime/node"; fi
"$enhanced_node" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 24 || (major === 24 && minor < 9)) { console.error("DH enhanced requires Node.js >=24.9. Set DSH_ENHANCED_NODE to a supported Node executable."); process.exit(1); }'
if [[ "$enhanced_node" == */* ]]; then export PATH="$(dirname "$enhanced_node"):$PATH"; fi
