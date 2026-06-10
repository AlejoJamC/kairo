#!/usr/bin/env bash
# Pre-dev check: warns loudly (without blocking) if a locally-required
# dependency for the configured intelligence provider isn't reachable.
#
# Today this only checks Ollama, since INTELLIGENCE_PROVIDER/EMBEDDING_PROVIDER
# default to "ollama" and the classification pipeline fails in a silent
# infinite-retry loop ("Unable to connect") when it isn't running.

set -uo pipefail

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || exit 0

get_var() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-
}

INTELLIGENCE_PROVIDER=$(get_var INTELLIGENCE_PROVIDER)
EMBEDDING_PROVIDER=$(get_var EMBEDDING_PROVIDER)
OLLAMA_BASE_URL=$(get_var OLLAMA_BASE_URL)
OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-http://localhost:11434}

needs_ollama=false
[ "${INTELLIGENCE_PROVIDER:-ollama}" = "ollama" ] && needs_ollama=true
[ "${EMBEDDING_PROVIDER:-ollama}" = "ollama" ] && needs_ollama=true

if [ "$needs_ollama" = true ]; then
  if ! curl -sf -m 2 "${OLLAMA_BASE_URL}/api/tags" > /dev/null 2>&1; then
    echo ""
    echo "⚠️  Ollama no responde en ${OLLAMA_BASE_URL}"
    echo "   INTELLIGENCE_PROVIDER/EMBEDDING_PROVIDER=ollama necesita Ollama corriendo localmente."
    echo "   Arráncalo (la app de Ollama o \`ollama serve\`) antes de seguir,"
    echo "   o la clasificación de tickets fallará en bucle ('Unable to connect')"
    echo "   y el wizard de onboarding se quedará cargando indefinidamente."
    echo ""
  fi
fi
