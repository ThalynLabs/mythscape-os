# The Well — cPanel Brief
*OpenClaw as the server. The Well as the control panel.*

Generated: 2026-03-01  
Purpose: Feature inventory for Well expansion. Hand to Zeus/Zion/Hermes for GUI design per panel.

---

## The Frame

cPanel is to servers as The Well is to OpenClaw.  
Everything you can do with OpenClaw from a terminal — configuring agents, managing channels,
scheduling crons, reading logs, browsing memory — should be reachable from the Well.
VoiceOver-first. Accessible by default. No tables where lists work better.

---

## Feature Inventory (grouped by domain)

### 1. Chat (BUILT)
- Agent chat with streaming SSE
- Agent switching dropdown
- Session history (sliding window)
- Image paste → workspace save → agent `image` tool
- Notification chime on completion
- Stop button / message queue
- Copy-as-text / copy-as-markdown
- Up-arrow message history recall

---

### 2. Agent Management
Source: `openclaw agents`, `openclaw agent <id>`
- List all configured agents (id, model, tools, description)
- View agent config (model, system prompt excerpt, tool allowlist)
- Edit agent display name / model
- Create new agent (guided form)
- Delete / disable agent
- View agent's active session (link to chat)

---

### 3. Session Explorer
Source: `openclaw sessions`
- List active sessions (label, agent, last message time, message count)
- View session history (read-only transcript)
- Send message into session (`sessions_send`)
- Kill / prune a session
- Compaction status

---

### 4. Cron Manager
Source: `openclaw cron`
- List all scheduled jobs (name, schedule, next run, enabled/disabled)
- Add job (schedule type: at / every / cron expression; payload type: systemEvent / agentTurn)
- Edit / disable / delete job
- Run job immediately
- View run history per job
- Delivery config (announce / webhook / none)

---

### 5. Memory Browser
Source: `memory_search`, `memory/YYYY-MM-DD.md`, `MEMORY.md`
- Search memory (query → vector results)
- Browse daily memory files by date
- View / edit MEMORY.md (long-term)
- View / edit notebook entries
- View / edit preferences.md

---

### 6. Channels
Source: `openclaw channels`, channel config
- List configured channels (Discord, Signal, Telegram, iMessage, etc.)
- View channel status (connected / error)
- Channel-specific settings (bot token, group IDs, routing rules)
- Test send to a channel

---

### 7. Config Editor
Source: `openclaw config`
- View full gateway config (JSON)
- Edit key sections via web forms:
  - Gateway port / auth token
  - Model providers (API keys, default model)
  - Agent defaults
  - Plugin list
- Apply config (with validation before save)
- Restart gateway button

---

### 8. Logs
Source: `/var/log/openclaw-voice/daemon.log`, `openclaw logs`
- Live tail of daemon log
- Gateway log viewer
- Filter by level (INFO / WARNING / ERROR)
- Search within logs

---

### 9. Secrets Manager
Source: `openclaw secrets`
- List secret keys (names only, never values)
- Add / rotate / delete secrets
- macOS Keychain integration status

---

### 10. Skills & Plugins
Source: `openclaw skills`, `openclaw plugins`
- List installed skills
- View skill description / SKILL.md
- Install from ClawhHub (when Valerie permits)
- List active plugins / extension status

---

### 11. Nodes
Source: `openclaw nodes`
- List paired nodes (name, type, last seen)
- Node capabilities (camera, screen, location, audio)
- Send notification to node
- View node status

---

### 12. Health / Status (PARTIALLY BUILT)
Currently: dot + "online" in chat header
Expand to:
- Gateway uptime, restart count
- Model provider connectivity (Anthropic, OpenAI, OpenRouter)
- Active session count
- Channel connection status summary
- Daemon uptime, version
- Last heartbeat time

---

### 13. Voice (Phase 2 — not yet built)
- Wake word status (active / inactive)
- Wake detections counter
- Input / output device picker
- Sensitivity slider
- Test voice (speak a phrase)
- ElevenLabs voice picker + preview

---

## Panel Priority for Zeus/Zion/Hermes Design Pass

| Priority | Panel | Why |
|----------|-------|-----|
| 1 | Chat | Built — reference implementation |
| 2 | Health/Status | Already partially there |
| 3 | Agent Management | Most-used config surface |
| 4 | Cron Manager | Already using cron heavily |
| 5 | Memory Browser | Daily use — notebook, memory search |
| 6 | Session Explorer | Useful for debugging multi-agent |
| 7 | Config Editor | Power-user but important |
| 8 | Logs | Debugging surface |
| 9 | Channels | Set-and-forget mostly |
| 10 | Secrets Manager | Sensitive — Zion should weigh in |
| 11 | Skills & Plugins | Lower frequency |
| 12 | Nodes | Future (Ebo X direction) |
| 13 | Voice | Phase 2 |

---

## Questions for Zeus/Zion/Hermes

**For Zeus (design):**
- What's the right nav metaphor? Sidebar panels? Tab strip? Something else entirely?
- Cron manager: form-based or natural language ("every Sunday at 10am")?
- Memory browser: search-first or browse-first?
- Should config editing be raw JSON (power users) or structured forms only?

**For Zion (security):**
- Secrets manager: should the Well ever display secret names? Or just counts?
- Config editor: require re-auth before applying config changes?
- Log viewer: filter out any sensitive tokens that appear in logs?
- Should the Well be Tailscale-only forever, or could it support auth eventually?

**For Hermes (wiring):**
- Which panels need live/polling data vs. one-shot fetch?
- Chat already has SSE — should logs also use SSE for live tail?
- How should the Well talk to the OpenClaw gateway for non-chat operations?
  (The daemon already proxies `/v1/chat/completions` — should it also proxy `openclaw` CLI calls?)

---

## Technical Notes

- All panels served from the same daemon (port 9355)
- Daemon proxies to gateway at `http://localhost:18789`
- UI files in workspace — no deploy for UI-only changes
- daemon.py changes require `sudo bash deploy.sh && openclaw gateway restart`
- CSS design tokens already defined (--well-void, --well-deep, --well-stone, etc.)
- VoiceOver-first: semantic HTML over ARIA, no info by color alone
