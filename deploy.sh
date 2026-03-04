#!/usr/bin/env bash
# Urðarbrunnr — Deploy daemon.py + ui/ folder
# Run as: sudo bash deploy.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_DIR="/opt/openclaw-voice"

echo "Deploying daemon.py..."
cp "${SCRIPT_DIR}/daemon.py" "${DAEMON_DIR}/daemon.py"
chown root:wheel "${DAEMON_DIR}/daemon.py"
chmod 644 "${DAEMON_DIR}/daemon.py"
echo "✓ daemon.py deployed (root-owned)"

echo "Deploying ui/..."
mkdir -p "${DAEMON_DIR}/ui"
cp -r "${SCRIPT_DIR}/ui/"* "${DAEMON_DIR}/ui/"
chown -R _openclaw-voice:staff "${DAEMON_DIR}/ui"
chmod -R 755 "${DAEMON_DIR}/ui"
echo "✓ ui/ deployed"

echo "Checking dependencies..."
"${DAEMON_DIR}/.venv/bin/pip" install --quiet -r "${SCRIPT_DIR}/requirements.txt"
echo "✓ Dependencies up to date"

echo ""
echo "Done. Restart the gateway to reload: openclaw gateway restart"
