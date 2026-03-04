/**
 * TheNorns.jsx — Agent and memory management section
 *
 * Named after the three Norns of Norse mythology who tend Yggdrasil at the Well of Urd:
 *   - Urd ("what has passed"): memory, conversation history, MEMORY.md, past state
 *   - Verdandi ("what is now"): active agent, current model, live session state
 *   - Skuld ("what is yet to be"): heartbeat/cron schedule, upcoming tasks
 *
 * This maps directly to OpenClaw's architecture:
 *   - Urd → the agent's memory system (MEMORY.md, daily journals, notebook)
 *   - Verdandi → the running agent instance (model, session, active config)
 *   - Skuld → the cron/heartbeat system (scheduled tasks, next run times)
 *
 * Data source: /health endpoint on the Well daemon (port 9355), which
 * proxies relevant fields from the OpenClaw gateway on port 18789.
 * The component polls /health every 30 seconds via the useGatewayHealth hook
 * passed down from App.jsx — no duplicate polling.
 *
 * Accessibility: uses <details>/<summary> for the three Norn sections so
 * VoiceOver announces "disclosure triangle, collapsed/expanded" natively.
 * Status values use <output> as a live region where data updates over time.
 * Definition lists (<dl>) for key-value stat pairs — VoiceOver reads these
 * as "term, definition" pairs, giving natural semantic structure.
 */

import { useState, useEffect } from "react";

// ── Utility: human-readable uptime ───────────────────────────────────────────
// Converts raw seconds from /health into a readable string.
// Used in Verdandi (current agent state) and in The Well's status card.
function formatUptime(s) {
  if (!s && s !== 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} days, ${h} hours`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Urd: What Has Passed ──────────────────────────────────────────────────────
// Urd holds memory — the record of what was said and done.
// Currently displays the memory summary endpoint and quick links to identity files.
// Phase 2 will add: MEMORY.md browser, memory search, daily journal viewer.
function Urd() {
  return (
    <details className="norn-pane" open>
      <summary className="norn-heading">
        {/* Urd's name means "fate" or "what has happened" in Old Norse.
            She is the eldest Norn and keeper of the past. */}
        <span className="norn-name">Urd</span>
        <span className="norn-role">What has passed · Memory</span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Urd holds the record of what was spoken at the Well. Memory files,
          daily journals, and the long thread of past sessions.
        </p>

        {/* Identity files — the documents that define who the agent is.
            These live in the workspace and shape every response Sethren gives.
            Clicking these will eventually open inline editors (Phase 2: The Runes). */}
        <section aria-label="Identity files">
          <h3>Identity files</h3>
          <ul className="file-list">
            <li>
              <span className="file-icon" aria-hidden="true">📜</span>
              <span className="file-name">SOUL.md</span>
              <span className="file-desc">— who the agent is</span>
            </li>
            <li>
              <span className="file-icon" aria-hidden="true">📋</span>
              <span className="file-name">AGENTS.md</span>
              <span className="file-desc">— how the agent operates</span>
            </li>
            <li>
              <span className="file-icon" aria-hidden="true">👤</span>
              <span className="file-name">USER.md</span>
              <span className="file-desc">— who the agent is serving</span>
            </li>
            <li>
              <span className="file-icon" aria-hidden="true">🧠</span>
              <span className="file-name">MEMORY.md</span>
              <span className="file-desc">— long-term curated memory</span>
            </li>
          </ul>
        </section>

        <p className="coming-soon-inline">
          Memory browser and journal viewer are being carved — coming in Phase 2.
        </p>
      </div>
    </details>
  );
}

// ── Verdandi: What Is Now ─────────────────────────────────────────────────────
// Verdandi holds the present — the running agent instance, its current model,
// uptime, and live session state. This is the most data-rich pane because
// /health gives us real values to work with right now.
function Verdandi({ health, agents }) {
  // Determine if the gateway is reachable and what state it's in.
  // "healthy" means the daemon is up and the gateway is responding.
  const gatewayStatus = health?.status ?? "connecting";
  const isHealthy = gatewayStatus === "healthy";

  return (
    <details className="norn-pane" open>
      <summary className="norn-heading">
        {/* Verdandi means "what is happening now" or "becoming" in Old Norse.
            She is the middle Norn, presiding over the present moment. */}
        <span className="norn-name">Verdandi</span>
        <span className="norn-role">What is now · Active state</span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Verdandi holds the thread being spun right now — the running agent,
          the active model, and the current state of the gateway.
        </p>

        {/* Gateway runtime stats — sourced from /health, updated every 30s.
            Uses <output> as a semantic live region so VoiceOver can announce
            status changes without the user having to navigate to this section. */}
        <section aria-label="Gateway runtime">
          <h3>Gateway</h3>
          {/* Living language for gateway state — "The tree stands" instead of "Running".
              Matches the mythic register used throughout The Well. */}
          <output className={`gateway-badge ${isHealthy ? "ok" : "error"}`}>
            <span className="dot" aria-hidden="true" />
            {isHealthy
              ? "The tree stands"
              : gatewayStatus === "offline"
              ? "The roots are dry"
              : "The waters stir…"}
          </output>

          <dl className="stat-grid">
            <dt>Uptime</dt>
            <dd>{formatUptime(health?.uptime_seconds)}</dd>

            <dt>Gateway URL</dt>
            <dd>{health?.gateway_url ?? "—"}</dd>

            <dt>Phase</dt>
            <dd>{health?.phase ?? "—"}</dd>

            <dt>Restart count</dt>
            {/* Restart count above 0 is worth knowing — repeated restarts suggest instability */}
            <dd className={health?.restart_count > 0 ? "ember" : ""}>
              {health?.restart_count ?? "—"}
            </dd>
          </dl>
        </section>

        {/* Active agents — lists all known agents from /api/agents.
            "Active" here means registered and ready, not necessarily mid-conversation. */}
        <section aria-label="Active agents">
          <h3>Agents</h3>
          <ul className="agent-list">
            {agents.map(a => (
              <li key={a.agentId} className="agent-item">
                <span className="agent-name">{a.displayName}</span>
                <span className="agent-id muted">({a.agentId})</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </details>
  );
}

// ── Skuld: What Is Yet To Be ──────────────────────────────────────────────────
// Skuld holds the future — the heartbeat/cron schedule, upcoming task runs,
// and anything the agent has committed to doing on a schedule.
// Data comes from /health (wake_word and basic state) for now.
// Phase 2 will add: full cron job list from openclaw cron, task edit UI.
function Skuld({ health }) {
  // Pull heartbeat state from the /health endpoint.
  // The Well daemon returns wake_word state in /health; heartbeat details
  // will come from a dedicated /api/cron endpoint (Phase 2).
  const wakeActive = health?.wake_word?.active ?? false;
  const wakeDetections = health?.wake_word?.detections_last_hour ?? 0;

  return (
    <details className="norn-pane">
      <summary className="norn-heading">
        {/* Skuld means "what shall be" or "debt/obligation" in Old Norse.
            She is the youngest Norn, weaving the threads of the future.
            In OpenClaw terms: she tends the cron jobs and heartbeat schedule. */}
        <span className="norn-name">Skuld</span>
        <span className="norn-role">What is yet to be · Scheduled tasks</span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Skuld holds the obligations not yet fulfilled — tasks scheduled to run,
          heartbeat checks, and the rhythm of the agent's future work.
        </p>

        {/* Wake word state — from /health, available now.
            When wake word is active, the daemon is listening for the trigger phrase
            to activate voice mode without touching the keyboard. */}
        <section aria-label="Wake word">
          <h3>Wake word</h3>
          <dl className="stat-grid">
            <dt>Status</dt>
            <dd>
              <output className={wakeActive ? "ok" : "muted"}>
                {wakeActive ? "Listening" : "Inactive"}
              </output>
            </dd>
            <dt>Detections (last hour)</dt>
            <dd>{wakeDetections}</dd>
          </dl>
        </section>

        {/* Cron / heartbeat section — placeholder pending /api/cron endpoint.
            The openclaw cron system runs tasks on a schedule defined in HEARTBEAT.md
            and via `openclaw cron add`. Full list will show here in Phase 2. */}
        <section aria-label="Scheduled tasks">
          <h3>Scheduled tasks</h3>
          <p className="coming-soon-inline">
            Full cron list is being woven — coming in Phase 2 once the
            gateway cron endpoint is wired.
          </p>
        </section>
      </div>
    </details>
  );
}

// ── TheNorns (root component) ─────────────────────────────────────────────────
// Composes the three Norn panes into a single section.
// Receives health + agents props from App.jsx so we share one polling loop,
// rather than each Norn managing its own fetch timer.
export default function TheNorns({ health, agents }) {
  return (
    <div className="section-content norns-section">
      <p className="section-desc">
        Three sisters tend the World Tree. Each holds a different strand of time.
      </p>

      {/* The three Norns — each a <details> block so VoiceOver can navigate
          them as disclosure triangles and expand only the one relevant right now.
          Urd and Verdandi default open because past context and live state are
          the most frequently needed. Skuld defaults closed (future/schedule
          is consulted less often). */}
      <Urd />
      <Verdandi health={health} agents={agents} />
      <Skuld health={health} />
    </div>
  );
}
