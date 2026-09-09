#!/bin/bash
# ==============================================================================
# WAPPY IA - Atajo de configuración para NotebookLM MCP
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/setup-notebooklm-auth.js"
