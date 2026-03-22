#!/bin/bash
# deploy.sh — copy built UI and update daemon to serve from GitHub repo
set -e

echo "→ Copying built UI to /opt/mythscape-os/ui..."
cp -r /Users/threadweaver/GitHub/mythscape-os/ui/* /opt/mythscape-os/ui/
chmod -R o+rX /opt/mythscape-os/ui/

echo "→ Updating daemon to serve UI from GitHub repo..."
python3 - <<'EOF'
import re, pathlib

daemon = pathlib.Path("/opt/mythscape-os/daemon.py")
src = daemon.read_text()

old = (
    "# Serve UI from workspace so updates don't require sudo deploy\n"
    "# Falls back to /opt/mythscape-os/ui if workspace isn't readable\n"
    "_WORKSPACE_UI     = pathlib.Path(\"/Users/threadweaver/.openclaw/workspace/mythscape-os/ui\")\n"
    "try:\n"
    "    _workspace_ui_ok = _WORKSPACE_UI.exists()\n"
    "except PermissionError:\n"
    "    _workspace_ui_ok = False\n"
    "UI_DIR            = _WORKSPACE_UI if _workspace_ui_ok else DAEMON_DIR / \"ui\""
)

new = (
    "# Serve UI from GitHub repo (source of truth) — no deploy step needed after build\n"
    "# Falls back to workspace copy, then /opt/mythscape-os/ui\n"
    "_GITHUB_UI        = pathlib.Path(\"/Users/threadweaver/GitHub/mythscape-os/ui\")\n"
    "_WORKSPACE_UI     = pathlib.Path(\"/Users/threadweaver/.openclaw/workspace/mythscape-os/ui\")\n"
    "try:\n"
    "    _github_ui_ok = _GITHUB_UI.exists() and (_GITHUB_UI / \"index.html\").exists()\n"
    "except PermissionError:\n"
    "    _github_ui_ok = False\n"
    "try:\n"
    "    _workspace_ui_ok = _WORKSPACE_UI.exists()\n"
    "except PermissionError:\n"
    "    _workspace_ui_ok = False\n"
    "UI_DIR = _GITHUB_UI if _github_ui_ok else (_WORKSPACE_UI if _workspace_ui_ok else DAEMON_DIR / \"ui\")"
)

if old in src:
    daemon.write_text(src.replace(old, new))
    print("  daemon.py updated ✓")
else:
    print("  WARNING: pattern not found — daemon.py unchanged")
EOF

echo "→ Restarting mythscape-os daemon..."
launchctl kickstart -k system/org.mythscape-os.daemon 2>/dev/null \
  || launchctl stop org.mythscape-os.daemon && sleep 1 && launchctl start org.mythscape-os.daemon 2>/dev/null \
  || echo "  (restart manually if needed)"

echo "→ Removing /opt/mythscape-os/ui (no longer needed)..."
rm -rf /opt/mythscape-os/ui

echo "Done. The Well now serves UI directly from ~/GitHub/mythscape-os/ui"
echo "Workflow going forward: edit → npm run build (in ui-src/) → reload browser"
