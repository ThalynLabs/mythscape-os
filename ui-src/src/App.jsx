/**
 * App.jsx — Urðarbrunnr root
 * The Well of Urd — OpenClaw control surface
 *
 * Nav sections: The Well · The Roots · The Norns · The Branches · The Runes · The Hearth
 * Chat lives inside The Well (home section).
 */

import { useState, useEffect, useCallback } from "react";
import Chat           from "./components/Chat.jsx";
import TheNorns       from "./components/TheNorns.jsx";
import TheHearth      from "./components/TheHearth.jsx";
import TheRunes       from "./components/TheRunes.jsx";
import TheThreads     from "./components/TheThreads.jsx";
import TheRoots       from "./components/TheRoots.jsx";
import TheBranches    from "./components/TheBranches.jsx";
import TheVoice       from "./components/TheVoice.jsx";
import TheNodes       from "./components/TheNodes.jsx";
import TheSkein       from "./components/TheSkein.jsx";
import RoomsPanel     from "./components/RoomsPanel.jsx";
import TheMoirai      from "./components/TheMoirai.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import { BrainPhaseHeaderIndicator } from "./components/BrainPhaseControl.jsx";
import { panelRegistry } from "./panelRegistry.js";

// ── Health polling ────────────────────────────────────────────────────────────
function useGatewayHealth() {
  const [health, setHealth] = useState(null);
  const poll = useCallback(async () => {
    try {
      const r = await fetch("/health");
      if (r.ok) setHealth(await r.json());
      else setHealth({ status: "error" });
    } catch { setHealth({ status: "offline" }); }
  }, []);
  useEffect(() => {
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, [poll]);
  return health;
}

// ── Well stats ───────────────────────────────────────────────────────────────
// Aggregates stat-grid data from /api/sessions (active count, tokens today,
// cost today) and /api/chat/history (message count for this session).
// Polls /api/sessions every 60s — cheap enough, valuable enough.
function useWellStats(activeAgentId) {
  const [stats, setStats] = useState({
    messages: null,
    tokensToday: null,
    costToday: null,
    activeSessions: null,
  });

  // Chat message count — per-session, refetch when agent switches
  useEffect(() => {
    const sessionId = sessionStorage.getItem("well-session-id") || "default";
    fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const msgs = Array.isArray(data.history) ? data.history.length : 0;
        setStats(s => ({ ...s, messages: msgs }));
      })
      .catch(() => {});
  }, [activeAgentId]);

  // Sessions aggregate — active count, tokens today, cost today
  const pollSessions = useCallback(async () => {
    try {
      const r = await fetch("/api/sessions");
      if (!r.ok) return;
      const data = await r.json();
      if (!data.ok || !Array.isArray(data.sessions)) return;

      const now = Date.now();

      // Active = updated in last 30 minutes
      const activeSessions = data.sessions.filter(
        s => (now - (s.updatedAt || 0)) < 30 * 60 * 1000
      ).length;

      // Tokens + cost: use daemon-computed daily deltas (tokensToday / costToday per session)
      let tokensToday = 0;
      let costToday = 0;
      for (const s of data.sessions) {
        tokensToday += s.tokensToday || 0;
        costToday   += s.costToday   || 0;
      }

      setStats(s => ({
        ...s,
        activeSessions,
        tokensToday: tokensToday || null,
        costToday:   costToday   || null,
      }));
    } catch (_) {}
  }, []);

  useEffect(() => {
    pollSessions();
    const t = setInterval(pollSessions, 60_000);
    return () => clearInterval(t);
  }, [pollSessions]);

  return stats;
}

// ── Cron jobs (Skuld's schedule) ──────────────────────────────────────────────
// Fetches /api/cron once and re-polls every 5 minutes.
// Jobs are sorted by daemon: enabled first, then alphabetical.
function useCronJobs() {
  const [jobs,    setJobs]    = useState(null);
  const [cronErr, setCronErr] = useState(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/cron");
      const d = await r.json();
      if (d.ok && Array.isArray(d.jobs)) {
        setJobs(d.jobs);
        setCronErr(null);
      } else {
        setCronErr(d.error || "Unknown error");
      }
    } catch (e) {
      setCronErr(e.message);
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5 * 60_000);
    return () => clearInterval(t);
  }, [poll]);

  return { jobs, cronErr };
}

// ── SkuldSchedule ─────────────────────────────────────────────────────────────
// The Norn of the future holds what is yet to come.
// Renders cron jobs as a disclosure list — VoiceOver-friendly, no table.
function SkuldSchedule({ jobs, cronErr }) {
  if (cronErr) {
    return (
      <details className="skuld-schedule">
        <summary>Skuld's schedule</summary>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Could not load schedule: {cronErr}
        </p>
      </details>
    );
  }

  if (!jobs) {
    return (
      <details className="skuld-schedule">
        <summary>Skuld's schedule —</summary>
        <p className="skuld-empty">Reading the threads…</p>
      </details>
    );
  }

  if (jobs.length === 0) {
    return (
      <details className="skuld-schedule">
        <summary>Skuld's schedule —</summary>
        <p className="skuld-empty">No jobs scheduled. The loom is still.</p>
      </details>
    );
  }

  // Split enabled vs disabled for cleaner VoiceOver experience
  const enabled  = jobs.filter(j => j.enabled);
  const disabled = jobs.filter(j => !j.enabled);

  function statusLabel(job) {
    const s = job.lastRunStatus;
    if (!s) return "never run";
    if (s === "ok") return "✓ ok";
    if (s === "error") return "✗ error";
    return s;
  }

  function nextLabel(job) {
    if (!job.nextRunAtMs) return null;
    const diff = job.nextRunAtMs - Date.now();
    if (diff < 0) return "overdue";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 23) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0)  return `in ${h}h ${m}m`;
    return `in ${m}m`;
  }

  function renderJob(job) {
    const next = nextLabel(job);
    return (
      <li key={job.id} className="skuld-job">
        <dl className="skuld-job-dl">
          <dt className="sr-only">Job</dt>
          <dd className="skuld-job-name">{job.name}</dd>
          <dt>Schedule</dt>
          <dd className="muted">{job.scheduleExpr || "—"}</dd>
          {next && (<><dt>Next run</dt><dd className="muted">{next}</dd></>)}
          <dt>Last status</dt>
          <dd className={`skuld-status skuld-status-${job.lastRunStatus || "none"}`}>
            {statusLabel(job)}
          </dd>
        </dl>
      </li>
    );
  }

  return (
    <details className="skuld-schedule">
      <summary>Skuld's schedule — {enabled.length} active</summary>
      <ul className="skuld-job-list" role="list" aria-label="Scheduled jobs">
        {enabled.map(renderJob)}
        {disabled.length > 0 && (
          <li>
            <details className="skuld-disabled">
              <summary className="muted">{disabled.length} disabled job{disabled.length !== 1 ? "s" : ""}</summary>
              <ul role="list">
                {disabled.map(j => (
                  <li key={j.id} className="skuld-job skuld-job-disabled">
                    <span className="muted">{j.name}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        )}
      </ul>
    </details>
  );
}

// ── Agent loading ─────────────────────────────────────────────────────────────
function useAgents() {
  const [agents, setAgents] = useState([
    { agentId: "main",      displayName: "Sethren" },
    { agentId: "thalyn-ns", displayName: "Thalyn"  },
  ]);
  useEffect(() => {
    fetch("/api/agents")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.agents?.length) setAgents(data.agents); })
      .catch(() => {});
  }, []);
  return agents;
}

// ── StatusIndicator ───────────────────────────────────────────────────────────
// StatusIndicator — the living pulse in the header.
// Uses mythic language rather than technical status words because The Well is a place,
// not a process. "The Well runs clear" tells you the same thing as "online" but feels
// like something alive rather than a server reporting its own uptime.
function StatusIndicator({ health }) {
  const ok      = health?.status === "healthy";
  const offline = !health || health.status === "offline";
  const dotClass = ok ? "dot ok" : offline ? "dot error" : "dot";
  const label    = ok
    ? "The Well runs clear"
    : offline
    ? "The waters are troubled"
    : "Sensing the depths…";
  return (
    <div className="status-indicator" role="status" aria-live="polite" aria-label="Gateway status">
      <span className={dotClass} aria-hidden="true" />
      <span id="status-text">{label}</span>
    </div>
  );
}

// ── TheWell (metrics dashboard — no chat) ────────────────────────────────────
// The Well is the instrument panel: gateway health, live cost/token counters,
// Skuld's cron schedule, and runtime details. Chat lives in The Court.
function TheWell({ health }) {
  const uptime  = health?.uptime_seconds != null ? formatUptime(health.uptime_seconds) : "—";
  const version = health?.phase || "—";
  const hb      = "—"; // heartbeat time — wired when gateway exposes it

  // Live stats from /api/sessions + /api/chat/history.
  // activeAgentId not needed here — message count is session-level, not agent-level.
  const { messages, tokensToday, costToday, activeSessions } = useWellStats(null);

  // Cron jobs for Skuld's schedule
  const { jobs: cronJobs, cronErr } = useCronJobs();

  return (
    <div className="section-content">
      {/* Intro text from the prototype — sets the register for the whole section.
          "The waters run deep here" frames the gateway as a living place, not a process.
          The Gateway "draws all channels together" = the topology is made legible as story. */}
      <p className="section-intro">
        The waters run deep here. This is the heart of your OpenClaw instance —
        the Gateway that draws all channels together and keeps the tree alive.
      </p>

      {/* Gateway status card */}
      <div className="status-card" aria-label="Gateway status">
        <output className="gateway-status">
          <span className={`dot ${health?.status === "healthy" ? "ok" : "error"}`} aria-hidden="true" />
          {" "}{health?.status === "healthy"
            ? "The tree is healthy"
            : health?.status === "offline"
            ? "The tree has gone quiet"
            : "The tree stirs…"}
        </output>

        {/* Water level meters — semantic <meter> elements carry the right
            VoiceOver announcement: "Water level 100 percent level indicator".
            That mythic framing is the register we want throughout The Well.
            value is 1 (full) when healthy, 0 when offline, 0.5 when unknown. */}
        <div className="well-meters">
          <div className="meter-row">
            <span className="meter-label" id="meter-water-label">Water level</span>
            <meter
              aria-labelledby="meter-water-label"
              className="well-meter"
              value={health?.status === "healthy" ? 1 : health?.status === "offline" ? 0 : 0.5}
              min={0} max={1}
              low={0.3} high={0.8} optimum={1}
            >
              {health?.status === "healthy" ? "Full — the Well runs deep" : "Low — the waters recede"}
            </meter>
          </div>
          <div className="meter-row">
            <span className="meter-label" id="meter-health-label">System health</span>
            <meter
              aria-labelledby="meter-health-label"
              className="well-meter"
              value={health?.status === "healthy" ? 1 : health?.status === "offline" ? 0 : 0.5}
              min={0} max={1}
              low={0.3} high={0.8} optimum={1}
            >
              {health?.status === "healthy" ? "Healthy" : "Degraded"}
            </meter>
          </div>
        </div>

        <dl className="stat-grid">
          <dt>Uptime</dt>          <dd><output>{uptime}</output></dd>
          <dt>Last heartbeat</dt>  <dd>{hb}</dd>
          <dt>Active sessions</dt> <dd><output>{activeSessions != null ? activeSessions : "—"}</output></dd>
          <dt>Messages total</dt>  <dd><output>{messages != null ? messages.toLocaleString() : "—"}</output></dd>
          <dt>Tokens today</dt>    <dd><output>{tokensToday != null ? tokensToday.toLocaleString() : "—"}</output></dd>
          <dt>Cost today</dt>      <dd><output>{costToday != null ? `~$${costToday.toFixed(2)}` : "—"}</output></dd>
          <dt>Security</dt>        <dd>All clear — the Hearth burns steady</dd>
        </dl>
      </div>

      {/* Gateway runtime details — collapsible technical view for when you need it.
          Kept behind a disclosure so the landing stays clean.
          This is the "how is the tree actually standing" layer — version, port, endpoints. */}
      <details className="skuld-schedule">
        <summary>Gateway runtime details</summary>
        <dl className="stat-grid" style={{marginTop: "0.5rem"}}>
          <dt>Phase</dt>      <dd>{version}</dd>
          <dt>Gateway URL</dt><dd>{health?.gateway_url ?? "—"}</dd>
          <dt>Sessions</dt>   <dd><output>{activeSessions != null ? activeSessions : "—"}</output></dd>
        </dl>
      </details>

      {/* Skuld's schedule — Phase 3: live cron jobs from /api/cron */}
      <SkuldSchedule jobs={cronJobs} cronErr={cronErr} />

    </div>
  );
}

function formatUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── TheCourt (agent selector + chat + roster) ─────────────────────────────────
// The Court is the primary conversation surface — where you speak with agents.
// Agent selector at the top, the full streaming Chat interface below that,
// then the RoomsPanel roster for direct per-agent messaging and status.
// Chat was moved here from The Well so The Well can stay a clean metrics panel.
function TheCourt({ agents, activeAgentId, onAgentChange }) {
  return (
    <div className="section-content">
      {/* Agent selector — choose who you're speaking with */}
      <div className="agent-row">
        <label htmlFor="court-agent-select" className="agent-label">Speaking with:</label>
        <select
          id="court-agent-select"
          value={activeAgentId}
          onChange={e => onAgentChange(e.target.value)}
          aria-label="Select agent to talk to"
        >
          {agents.map(a => (
            <option key={a.agentId} value={a.agentId}>{a.displayName}</option>
          ))}
        </select>
      </div>

      {/* Chat — full streaming conversation surface */}
      <Chat agents={agents} activeAgentId={activeAgentId} onAgentChange={onAgentChange} />

      {/* RoomsPanel — agent roster, direct wake-and-message, court hierarchy */}
      <RoomsPanel agents={agents} />
    </div>
  );
}

// ── Placeholder sections ──────────────────────────────────────────────────────
function PlaceholderSection({ panel }) {
  return (
    <div className="section-content">
      <p className="section-desc">{panel?.description}</p>
      <p className="coming-soon">This section is being carved. The runes will appear soon.</p>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────


// ── AccessibilityToolbar ──────────────────────────────────────────────────────
// Sticky bar at the very top — single mute toggle for TTS speech.
// Speech-first accessibility: important events are spoken, not just announced
// via ARIA. This mute toggle lets Valerie silence speech without losing the
// visual UI. Persisted in localStorage so it survives page reloads.
//
// Design principle: ARIA live regions are for when you DON'T have TTS.
// We have TTS. We use it. ARIA is the fallback here, not the primary.
function AccessibilityToolbar() {
  const [muted, setMuted] = useState(
    () => localStorage.getItem("well-speech-muted") === "true"
  );

  function toggle() {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("well-speech-muted", String(next));
  }

  // Expose mute state globally so speak() helper can read it without prop-drilling
  useEffect(() => {
    window.__wellSpeechMuted = muted;
  }, [muted]);

  return (
    <div id="a11y-toolbar" role="toolbar" aria-label="Accessibility controls">
      <label className="speech-mute-label">
        <input
          type="checkbox"
          checked={muted}
          onChange={toggle}
          aria-label="Mute agent speech"
        />
        Mute speech
      </label>
    </div>
  );
}

// ── speak() helper ────────────────────────────────────────────────────────────
// Call this whenever something important needs to be spoken — update available,
// security alert, approval needed, etc. Respects the mute toggle.
// agent: "sethren" | "thalyn" | "zion" — defaults to "sethren"
async function speak(text, agent = "sethren") {
  if (window.__wellSpeechMuted) return;
  try {
    const r = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, agent }),
    });
    const d = await r.json();
    // Daemon returns base64 MP3 — browser plays it via Audio API.
    // _openclaw-voice has no audio session; browser has full audio access.
    if (d.ok && d.audio) {
      const bytes  = atob(d.audio);
      const buf    = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const blob   = new Blob([buf], { type: "audio/mpeg" });
      const url    = URL.createObjectURL(blob);
      const audio  = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    }
  } catch (e) {
    // Speech failure is always silent — text is still there in the UI.
    // Text is the floor. Speech is additive. Mute = text only.
  }
}

// ── UpdateBanner ─────────────────────────────────────────────────────────────
// Shown when OpenClaw has an update. Button runs `openclaw update` via daemon.
// TODO(update-btn): Replace copy-command with one-click update once the daemon
// has user-level exec reach (Phase 2 config editing / privileged helper script).
// Swap plan: remove copyCmd + CMD + update-cmd-group markup; restore the
// runUpdate() → POST /api/update → "Updating…" / "✓ Updated" flow.
// Do NOT leave both versions in — pick one and delete the other.
// Tracking: notebook/2026-03-02.md "Phase 2: one-click update button"
function UpdateBanner({ installed, latest, changelog }) {
  const DISMISS_KEY = `well-update-dismissed-${latest}`;
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "true"
  );
  const [copied, setCopied] = useState(false);
  const CMD = "openclaw update";

  // Speak on first render — only if not already dismissed this version.
  useEffect(() => {
    if (!dismissed) speak(`Mythscape OS update available. Version ${latest} is ready to install.`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function copyCmd() {
    navigator.clipboard.writeText(CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <output role="status" className="update-banner-wrap" aria-live="polite">
      <div className="update-banner-row">
        <span>
          Mythscape OS · The Well — update available: <strong>{latest}</strong>
          <span className="update-from"> (installed: {installed})</span>
        </span>
        <span className="update-cmd-group">
          <code className="update-cmd-text">{CMD}</code>
          <button className="update-btn" onClick={copyCmd}>
            {copied ? "✓ Copied" : "Copy command"}
          </button>
          <button className="update-dismiss" onClick={dismiss} aria-label="Dismiss update notice">
            ×
          </button>
        </span>
      </div>
      {changelog && (
        /*
         * PATTERN: disclosure-without-aria
         * Changelog collapsed by default — readable before updating, dismissable after.
         * Keyed to version so the next update brings it back fresh.
         */
        <details className="update-changelog">
          <summary className="update-changelog-toggle">What changed in {latest}</summary>
          <pre className="update-changelog-body">{changelog}</pre>
        </details>
      )}
    </output>
  );
}

export default function App() {
  const [activeSection,  setActiveSection]  = useState("well");
  const [activeAgentId,  setActiveAgentId]  = useState("main");
  const [paletteOpen,    setPaletteOpen]    = useState(false);
  const health = useGatewayHealth();
  const agents = useAgents();

  // ⌘K / Ctrl+K — global shortcut to open the command palette.
  // Attached to the document so it fires regardless of focus position.
  useEffect(() => {
    function handleGlobalKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const currentPanel = panelRegistry.get(activeSection) || panelRegistry.get("well");

  // Category display names — mythic language instead of technical labels.
  // "infrastructure" as a heading would break the immersion the section names create.
  // These are the headings VoiceOver reads when navigating the sidebar groups.
  const CATEGORY_LABELS = {
    infrastructure: "The World Tree",
    process:        "The Weaving",
    capability:     "The Gifts",
    realm:          "The Nine Realms",
  };

  const renderSection = () => {
    switch (activeSection) {
      case "well":
        return <TheWell health={health} />;
      case "norns":
        // Pass health + agents down so TheNorns shares the same polling loop as The Well —
        // no duplicate /health fetches, no separate timers.
        return <TheNorns health={health} agents={agents} />;
      case "hearth":
        // The Hearth gets health for security posture, but no agents needed —
        // security state is gateway-level, not per-agent.
        return <TheHearth health={health} />;
      case "runes":
        return <TheRunes health={health} />;
      case "skein":
        return <TheSkein />;
      case "threads":
        return <TheThreads />;
      case "court":
        return <TheCourt agents={agents} activeAgentId={activeAgentId} onAgentChange={setActiveAgentId} />;
      case "roots":
        return <TheRoots />;
      case "branches":
        return <TheBranches />;
      case "voice":
        return <TheVoice />;
      case "nodes":
        return <TheNodes />;
      case "moirai":
        return <TheMoirai />;
      default:
        return <PlaceholderSection panel={currentPanel} />;
    }
  };

  return (
    <>
      {/* Skip link */}
      <a href="#main-content" className="skip-link">Skip to content</a>

      {/* Command palette — rendered outside the layout so it overlays everything */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(id) => { setActiveSection(id); setPaletteOpen(false); }}
        onAction={(id) => {
          if (id === "action:refresh") window.location.reload();
          // future actions handled here
        }}
      />

      <div id="app-shell">
        {/* ── Accessibility toolbar ──────────────────────────────────── */}
        {/* Speech-first: important events are spoken, not just ARIA-announced.
            Mute toggle sticks via localStorage. Always at top, always reachable. */}
        <AccessibilityToolbar />
        {/* ── Update banner ──────────────────────────────────────── */}
        {/*
         * PATTERN: live-region-via-output
         * ELEMENT: <output role="status">
         * WHY: Update notices are non-urgent status changes. <output> with
         *      role="status" is announced politely (after current speech).
         * VOICEOVER READS: "Mythscape OS update available: 2026.3.1"
         */}
        {health?.update?.available && (
          <UpdateBanner installed={health.update.installed} latest={health.update.latest} changelog={health.update.changelog} />
        )}

        {/* ── Header ─────────────────────────────────────────────── */}
        <header id="site-header" role="banner">
          <span className="wordmark" aria-label="Mythscape OS · The Well">
            Mythscape OS <span>· The Well</span>
          </span>
          <StatusIndicator health={health} />
          <BrainPhaseHeaderIndicator />
          <button
            id="palette-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette (Command K)"
            aria-keyshortcuts="Control+k Meta+k"
          >
            ⌘K
          </button>
          <a href="/settings" id="settings-link" aria-label="Open settings">⚙ Settings</a>
        </header>

        {/* ── Layout: sidebar + main ──────────────────────────────── */}
        <div id="layout">
          {/* Sidebar nav — driven by panel registry */}
          <nav id="sidebar" aria-label="Well of Urd navigation">
            {Object.entries(panelRegistry.grouped()).map(([category, panels]) => {
              if (!panels.length) return null;
              return (
                <div key={category} className="nav-group">
                  <h2 className="nav-group-heading">{CATEGORY_LABELS[category] || category}</h2>
                  <ol>
                    {panels.map(p => (
                      <li key={p.id}>
                        <button
                          className={activeSection === p.id ? "nav-btn active" : "nav-btn"}
                          onClick={() => setActiveSection(p.id)}
                          aria-current={activeSection === p.id ? "page" : undefined}
                        >
                          <span className="nav-icon" aria-hidden="true">{p.icon}</span>
                          {p.label}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </nav>

          {/* Main content */}
          <main id="main-content" aria-label={currentPanel?.label}>
            <h1>{currentPanel?.label}</h1>
            {renderSection()}
          </main>
        </div>
      </div>
    </>
  );
}
