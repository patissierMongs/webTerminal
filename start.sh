#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# --- Pre-checks ---
echo "=== OpenClaw Web Terminal ==="
echo ""

# Check tmux
if ! command -v tmux &>/dev/null; then
  echo "ERROR: tmux is not installed. Install it first."
  exit 1
fi

# Check node
if ! command -v node &>/dev/null; then
  echo "ERROR: node is not installed."
  exit 1
fi

# --- Directories ---
mkdir -p "$DIR/logs" "$DIR/summaries"

# --- tmux session ---
SESSION="${TMUX_SESSION:-openclaw}"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "  tmux session '$SESSION' already exists (reusing)"
else
  tmux new-session -d -s "$SESSION" -x 120 -y 40
  echo "  tmux session '$SESSION' created"
fi

# --- Ollama check ---
if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo "  Ollama: running"
else
  echo "  Ollama: not running (summarize feature unavailable)"
fi

# --- Tailscale info ---
if command -v tailscale &>/dev/null; then
  TS_IP=$(tailscale ip -4 2>/dev/null || echo "unknown")
  echo "  Tailscale IP: $TS_IP"
  echo "  Access at: http://$TS_IP:${PORT:-3030}"
else
  echo "  Tailscale: not installed"
fi

echo ""
echo "Starting server..."
echo ""

exec node "$DIR/server.js"
