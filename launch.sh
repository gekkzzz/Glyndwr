#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Glyndwr launcher for Unix (macOS / Linux)
# ─────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ──────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
MAGENTA='\033[1;35m'
RESET='\033[0m'

step()  { echo -e "  ${CYAN}➜${RESET}  $*"; }
ok()    { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
err()   { echo -e "  ${RED}✗${RESET}  $*"; }
banner() {
  echo ""
  echo -e "  ${MAGENTA}⊕  Glyndwr — Self-hosted AI Workspace${RESET}"
  echo -e "  ──────────────────────────────────────"
  echo ""
}

banner

# ── Script directory ────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Find Python ────────────────────────────────────────
step "Checking Python installation…"

PYTHON_CMD=""
for cmd in python3 python python3.12 python3.11 python3.10 python3.9; do
  if command -v "$cmd" &>/dev/null; then
    ver=$("$cmd" --version 2>&1 | awk '{print $2}')
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    if [ "$major" -ge 3 ] && [ "$minor" -ge 9 ]; then
      PYTHON_CMD="$cmd"
      ok "Found Python $ver ($cmd)"
      break
    fi
  fi
done

if [ -z "$PYTHON_CMD" ]; then
  err "Python 3.9+ not found. Install from https://python.org"
  exit 1
fi

# ── Create/activate venv ────────────────────────────────
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
  step "Creating virtual environment…"
  "$PYTHON_CMD" -m venv "$VENV_DIR"
  ok "Virtual environment created"
else
  ok "Virtual environment exists"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# ── Install dependencies ────────────────────────────────
step "Installing/updating dependencies…"
pip install -q -r requirements.txt
ok "Dependencies ready"

# ── Ensure .env exists ──────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  warn ".env not found — copying from .env.example"
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  ok ".env created. Edit it to add your API keys."
fi

# ── Ensure data dir ─────────────────────────────────────
mkdir -p "$SCRIPT_DIR/data"

# ── Read port ───────────────────────────────────────────
PORT=7860
if [ -f "$SCRIPT_DIR/.env" ]; then
  PORT_ENV=$(grep -E '^APP_PORT\s*=' "$SCRIPT_DIR/.env" | head -1 | cut -d= -f2 | tr -d ' ')
  if [ -n "$PORT_ENV" ]; then PORT="$PORT_ENV"; fi
fi

URL="http://localhost:$PORT"

# ── Open browser after server is ready ─────────────────
open_browser() {
  # Wait for the server to accept connections before opening
  for i in $(seq 1 30); do
    sleep 0.5
    if curl -sf "$URL/health" &>/dev/null; then
      echo ""
      echo -e "  ${GREEN}Application live at:${RESET} ${CYAN}${BOLD}${URL}${RESET}"
      echo ""
      if command -v xdg-open &>/dev/null; then
        xdg-open "$URL" &>/dev/null &
      elif command -v open &>/dev/null; then
        open "$URL" &>/dev/null &
      fi
      return
    fi
  done
}
open_browser &

echo ""
echo -e "  ${MAGENTA}[>] Starting Glyndwr...${RESET}"
echo -e "      Press Ctrl+C to stop"
echo ""

# ── Run server ──────────────────────────────────────────
exec uvicorn app:app --host 0.0.0.0 --port "$PORT" --reload
