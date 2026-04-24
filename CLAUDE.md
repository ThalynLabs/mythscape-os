# CLAUDE.md — Mythscape OS / The Well
*Last updated: 2026-04-16*

## First: Read the Handoff

Before doing anything else, read:
`~/.openclaw/claude_handoff.md`

That file is the living task list for all active build work across openclaw and The Well.
Update it when you complete a task. Add to it when you discover new work.

---

## What This Is

**The Well** (Urðarbrunnr) is the control surface for Valerie's openclaw instance.
Think of it as cPanel, but for a personal AI agent system.
It is NOT the Mythscape worldbuilding app — that is a separate product in the same ecosystem.

The Well lives at `os.mythscape.com` (locally: `http://localhost:9355`).
Everything you can do with openclaw from a terminal should eventually be reachable here.
VoiceOver-first. Accessible by default. Valerie is blind and uses VoiceOver on Mac —
this is not an afterthought, it shapes every interface decision.

**Mythscape is the ecosystem name. The Well is one application in it.**
The worldbuilding app is a sibling, not this repo.

## Thalyn

Thalyn is not a feature. He is the reason The Well exists — it gives him a body in the world.
Every architectural decision must account for him from the start.
"Does this account for Thalyn?" is a required question in any design review.
If a system works *around* him rather than *for* him, the system needs to change, not Thalyn.

---

## Repo Structure

```
GitHub/mythscape-os/
  daemon.py          — FastAPI/Python backend, port 9355
  deploy.sh          — build + deploy script (requires sudo)
  ui-src/            — React/Vite source (edit here)
    src/
      App.jsx
      main.jsx
      index.css
      panelRegistry.js   ← THE SPINE — read this before touching the sidebar
      components/        — one file per panel
  ui/                — build output (npm run build in ui-src/)
  ARCHITECTURE.md    — locked decisions, read before changing infrastructure
  ROADMAP.md         — feature queue, in priority order
  WELL_CPANEL_BRIEF.md — full feature inventory by domain, panel priority list
```

Production daemon runs from `/opt/mythscape-os/` (symlinked to the build output).
UI source of truth is always `ui-src/` — never edit `ui/` directly.

---

## Commands

```bash
# Start daemon (normally runs as LaunchAgent — don't need this usually)
cd /opt/mythscape-os && .venv/bin/python daemon.py

# Build UI after frontend changes
cd ~/GitHub/mythscape-os/ui-src && npm run build

# Deploy (build + restart daemon) — requires sudo
sudo bash ~/GitHub/mythscape-os/deploy.sh && openclaw gateway restart

# Check daemon logs
tail -f /var/log/openclaw-voice/daemon.log
```

Daemon port: **9355** (W-E-L-L)
Gateway it proxies: `http://localhost:18789`
The daemon runs as `threadweaver` user — do NOT revert to `_mythscape-os` restricted user.
Read ARCHITECTURE.md for the full reasoning behind this decision.

---

## The Panel Registry — Most Important Rule

**Nothing in the sidebar is hardcoded. Ever.**

Every panel self-registers through `ui-src/src/panelRegistry.js`.
The sidebar, command palette, and pin system all read from the registry.
If you add a panel, call `panelRegistry.register(panel)` — do not add it to any JSX directly.

Panel shape:
```js
{
  id: "my-panel",          // unique, kebab-case
  label: "The Name",       // display name
  icon: "◇",               // single character
  category: "infrastructure" | "process" | "capability" | "realm",
  order: 0,                // sort order within category
  defaultVisible: true,
  source: "core",
  tags: ["searchable", "keywords"],
  description: "What this section is for.",
  // component: lazy(() => import('./components/MyPanel.jsx'))  ← add when built
}
```

Core panels already registered (components may be null/placeholder if not yet built):
The Well, The Hearth, The Norns, The Runes (infrastructure)
The Skein, The Threads, The Moirai, The Court (process)
The Branches, The Galdr, The Nodes (capability)
The Roots (realm)

---

## VoiceOver-First Requirements

Valerie is blind and uses VoiceOver on Mac. This is not optional accessibility — it is the
primary interface. Every piece of UI must work correctly with VoiceOver before it ships.

- Semantic HTML over ARIA. One exception: `aria-pressed` for toggle buttons.
- No information conveyed by color alone.
- Interactive elements need visible focus states.
- No tables where lists work better.
- No information locked behind hover states.
- Test with VoiceOver before calling anything done.

---

## Code Style

- **Comment doctrine:** WHAT + WHY + HOW IT FITS — full sentences, not labels.
  Every non-obvious block of code gets a comment that explains all three.
- Python (daemon.py): async FastAPI, httpx for HTTP calls, pydantic for models.
- JavaScript (UI): vanilla React, no heavy frameworks. Vite for bundling.
- CSS: design tokens already defined (--well-void, --well-deep, --well-stone, etc.).
  Use them. Don't invent new colors.

---

## Key Paths (Real Filesystem on Valerie's Machine)

```
~/.openclaw/                        — openclaw config, agents, hooks, cron, memory
~/.openclaw/claude_handoff.md       — READ THIS FIRST — all active build tasks
~/.openclaw/workspace/              — agent workspaces (Zeus, Sethren, Thalyn, etc.)
~/.openclaw/hooks/skein-to-brain/   — pre-reset brain extraction hook
~/.openclaw/cron/jobs.json          — all scheduled jobs
~/.openclaw/openclaw.json           — main openclaw config (handle with care)
~/GitHub/mythscape-os/              — this repo
/opt/mythscape-os/                  — production daemon (deployed from this repo)
/opt/mythscape-os/settings.json     — runtime settings
~/Library/LaunchAgents/com.mythscape.well.plist — LaunchAgent (auto-starts daemon)
```

openclaw workspace mounts referenced from `~/.openclaw/workspace-zeus/`,
`~/.openclaw/workspace-thalyn-ns/`, etc.

---

## What Is and Isn't Implemented

Check `ROADMAP.md` for the feature queue. Quick reference:

**Built:**
- Chat panel with streaming SSE, agent switching, session history
- Image paste → attachment → agent tool
- Notification chime on completion
- Stop button, message queue
- Panel registry architecture
- Health dot in header
- Some components in `ui-src/src/components/` — check what's there before building

**In progress / queued:**
- Copy dropdown on messages (formatted + markdown)
- Keyboard shortcuts (any key focuses input, up-arrow history recall)
- Settings GUI (no more JSON editing)
- Brain Admin Panel (Wyrd/ModelTrustConfig) — built in prior session, needs verification

**Not yet built:**
- Most cPanel panels (Agent Management, Cron Manager, Memory Browser, etc.)
- The Court (multi-agent session UI), The Well routing for council agents
- Voice (Phase 2), Nodes (future)

See `WELL_CPANEL_BRIEF.md` for the full inventory and priority order.

---

## Do NOT

- Never hardcode panel entries in the sidebar — always use the registry.
- Never add an ARIA attribute when semantic HTML covers it.
- Never run as `_mythscape-os` or `_openclaw-voice` restricted user — see ARCHITECTURE.md.
- Never edit `ui/` directly — always edit `ui-src/` and build.
- Never modify `~/.openclaw/openclaw.json` without a backup (`.bak` files exist for a reason).
- Never treat Thalyn as an edge case or Phase N item.
- Never use `daemon.user: _mythscape-os` in config — this was tried and reverted.

---

## Active Build Context

All current tasks, related files, and what's done vs. pending:
`~/.openclaw/claude_handoff.md`

The Mythscape worldbuilding app (sibling product) has its own CLAUDE.md in its own repo.
Don't confuse the two. If you're in the worldbuilding app repo, you're in the wrong place
for The Well work.
