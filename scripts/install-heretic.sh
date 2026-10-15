#!/usr/bin/env bash
# Install Heretic (abliteration tool) and the recommended uncensored Ollama model for JARVIS.
# Usage: bash scripts/install-heretic.sh
# Optional: MODEL=Qwen/Qwen3-4B-Instruct-2507 bash scripts/install-heretic.sh

set -euo pipefail

MODEL="${MODEL:-huihui_ai/Qwen3.8-abliterated}"
PYTHON="${PYTHON:-python3}"

echo "=== JARVIS Heretic + model installer ==="

# 1. Python deps for Heretic
if ! command -v pip >/dev/null 2>&1 && ! command -v pip3 >/dev/null 2>&1; then
  echo "pip not found. Install python3-pip first."
  exit 1
fi

PIP_CMD="pip"
if ! command -v pip >/dev/null 2>&1; then
  PIP_CMD="pip3"
fi

echo "Installing heretic-llm..."
$PIP_CMD install -U heretic-llm

echo "Heretic installed. Verify:"
heretic --help | head -n 20 || true

# 2. Ollama model
if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama not found. Install Ollama first: https://ollama.com"
  exit 1
fi

echo "Pulling Ollama model: $MODEL"
ollama pull "$MODEL"

echo ""
echo "Done."
echo "Add to /home/toor/jarvis/.env:"
echo "  JARVIS_AI_AGENT_ENABLED=1"
echo "  JARVIS_OLLAMA_URL=http://127.0.0.1:11434"
echo "  JARVIS_OLLAMA_MODEL=$MODEL"
echo "  JARVIS_LLM_SENSITIVE_PROVIDER=ollama"
echo "  JARVIS_LLM_LOCAL=1"
echo ""
echo "Then: sudo systemctl restart jarvis"
echo ""
echo "To abliterate a new model with Heretic:"
echo "  heretic Qwen/Qwen3-4B-Instruct-2507"
