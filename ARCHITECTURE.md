# Mythscape OS — Architecture Notes

## Daemon User: Why We Run as `threadweaver`, Not `_mythscape-os`

**Decision date:** 2026-04-02  
**Decision:** The Well daemon runs as the `threadweaver` user via a LaunchAgent, not as the `_mythscape-os` restricted system user.

### Background

The original setup created a restricted OS user `_mythscape-os` (and previously `_openclaw-voice`) for security isolation. The intent was to prevent the daemon from accessing user files if compromised.

### Why we changed it

Mythscape OS is a **single-user personal tool running on Valerie's personal Mac Studio**. It is not a shared service, multi-tenant, or public-facing. The security isolation model that would justify a restricted daemon user applies to servers or shared machines — not a personal workstation where the daemon needs to:

- Read `~/.openclaw/openclaw.json` (OpenClaw config)
- Read the gateway auth token (from keychain or environment, passed by the OpenClaw plugin)
- Call back to the OpenClaw gateway at `localhost:18789` with that token
- Read agent session files, cron config, exec-approvals.json
- Serve The Well UI from `~/GitHub/mythscape-os/ui`

Running as `_mythscape-os` blocked all of these. Every token had to be threaded through a PID file or env var injection, and the restricted user couldn't read half the files it needed. The result was constant 401s from the gateway and a non-functional `/api/sessions` endpoint.

### Trade-offs accepted

| Concern | Mitigated by |
|---|---|
| Daemon can read user files | It needs to — this is by design |
| Daemon can write user files | Daemon.py is read-only on most paths; writes are intentional (logs, circuit-breaker report) |
| Daemon process isolation | Running in venv at `/opt/mythscape-os/.venv` still provides dependency isolation |
| If daemon is compromised | Attacker has access to threadweaver's files — same as any user-space process on a personal Mac |

This is the same security posture as any other app running on your Mac (VS Code, Terminal, etc.). The restricted-user setup was over-engineering for this deployment context.

### Current setup

- **LaunchAgent:** `~/Library/LaunchAgents/com.mythscape.well.plist` (runs as `threadweaver` automatically)
- **Daemon:** `/opt/mythscape-os/daemon.py` via `.venv/bin/python`
- **Token:** Read from environment (injected by OpenClaw plugin) or `~/.openclaw/openclaw.json` at runtime
- **Plugin config:** `daemon.user` set to empty string or removed — no `sudo -u` needed

### Do not revert

Do not change `daemon.user` back to `_mythscape-os` or `_openclaw-voice`. The restricted user pattern was tried and caused more problems than it solved on this deployment. If deploying Mythscape OS on a multi-user server in the future, revisit this decision at that time.
