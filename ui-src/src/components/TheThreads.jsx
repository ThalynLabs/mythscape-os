/**
 * TheThreads.jsx — Active session list for Urðarbrunnr
 *
 * "Threads are the living conversations — the strands Verdandi weaves right now."
 *
 * Shows OpenClaw sessions active in the last 24 hours, sorted newest first.
 * Data source: /api/sessions → gateway /tools/invoke → sessions_list
 *
 * Each thread shows its human-readable name (displayName when available),
 * surface/channel, agent, token count, estimated cost, and age.
 * "openai:UUID" sessions are isolated subagent runs — we label them as such
 * rather than showing meaningless UUIDs.
 */

import { useState, useEffect, useCallback } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a human-readable label for a session.
// Priority order:
//   1. session.label — set for cron jobs ("Cron: Weekly security research") and
//      any sessions_spawn call that passed a label
//   2. displayName that contains a channel name (discord:guild#channel-name format)
//   3. Key segment for known surfaces (dashboard, telegram, signal)
//   4. Short session ID — last resort for anonymous subagent runs
function sessionLabel(session) {
  const parts   = session.key.split(":");
  const surface = parts[2] ?? "unknown";

  // agent:main:main is the OpenClaw dashboard session — its displayName is a Discord
  // channel ID artifact, not a useful name. Override it unconditionally.
  if (session.key === "agent:main:main" || (surface === "main" && parts.length <= 3)) {
    return "Dashboard";
  }

  // Cron and labelled spawned sessions — most informative name available
  if (session.label) return session.label;

  // Discord/named channel: displayName format is "discord:guildId#channel-name"
  // Strip the "provider:numericId" prefix to get just "#channel-name"
  if (session.displayName) {
    const stripped = session.displayName.replace(/^[^:]+:\d+#?/, "");
    if (stripped && !stripped.startsWith("channel:") && !stripped.startsWith("webchat:")) {
      return stripped.startsWith("#") ? stripped : `#${stripped}`;
    }
  }

  // Known surfaces with parseable keys
  if (surface === "telegram") return parts.slice(3).join(":") || "Telegram";
  if (surface === "signal")   return parts.slice(3).join(":") || "Signal";

  // Anonymous subagent — can't recover identity without reading the transcript.
  // Show model + short session ID so at least different runs are distinguishable.
  const shortId = session.sessionId ? session.sessionId.slice(-8) : "unknown";
  return `Subagent …${shortId}`;
}

// Short model label — strip provider prefix and verbose version strings.
// "claude-sonnet-4-6" → "Sonnet 4.6" | "gpt-4o" → "GPT-4o" | "gemini-pro" → "Gemini Pro"
function modelLabel(model) {
  if (!model) return null;
  return model
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "GPT-")
    .replace(/^gemini-/, "Gemini ")
    .replace(/-(\d)/, " $1")          // "sonnet-4" → "sonnet 4"
    .replace(/^(.)/, c => c.toUpperCase()); // capitalise first letter
}

// Surface label cleaned up for display.
function sessionSurface(session) {
  if (session.channel && session.channel !== "unknown") return session.channel;
  const parts = session.key.split(":");
  const s = parts[2] ?? "unknown";
  if (s === "openai") return "subagent";
  return s;
}

function fmtTokens(n) {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function fmtAge(ms) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtCost(c) {
  if (c == null) return null;
  if (c < 0.001) return "<$0.001";
  return `~$${c.toFixed(3)}`;
}

const SURFACE_ICON = {
  discord:  "🔷",
  telegram: "✈️",
  signal:   "🔒",
  subagent: "🤖",
  main:     "🖥",
  openai:   "🤖",
  default:  "💬",
};

// ── Session row ───────────────────────────────────────────────────────────────
function ThreadRow({ session }) {
  const surface = sessionSurface(session);
  const label   = sessionLabel(session);
  const icon    = SURFACE_ICON[surface] || SURFACE_ICON.default;
  const cost    = fmtCost(session.costEst);
  const model   = modelLabel(session.model);

  // Subtitle: agent name + model — tells you who's running and on what
  const subtitle = [session.agentId, model].filter(Boolean).join(" · ");

  return (
    <li className="thread-row">
      <span className="thread-icon" aria-hidden="true">{icon}</span>
      <div className="thread-body">
        <span className="thread-label">{label}</span>
        {subtitle && <span className="thread-surface">{subtitle}</span>}
      </div>
      <dl className="thread-meta">
        {cost && (
          <>
            <dt className="sr-only">Estimated cost</dt>
            <dd className="thread-cost" title="Rough estimate at $6/1M blended token rate">{cost}</dd>
          </>
        )}
        <dt className="sr-only">Tokens</dt>
        <dd className="thread-tokens" title={`${session.totalTokens?.toLocaleString()} tokens`}>
          {fmtTokens(session.totalTokens)}
        </dd>
        <dt className="sr-only">Last active</dt>
        <dd className="thread-age">{fmtAge(session.ageMs)}</dd>
      </dl>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TheThreads() {
  const [sessions, setSessions] = useState(null);
  const [total,    setTotal]    = useState(null);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/sessions")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setSessions(d.sessions ?? []);
        setTotal(d.total ?? null);
        setError(null);
        setLoading(false);
      })
      .catch(e => {
        setError(`Could not load threads: ${e}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Group by surface for cleaner scanning.
  // Named channels (discord, telegram) first; subagents last — they're noisy.
  const grouped = {};
  (sessions ?? []).forEach(s => {
    const surf = sessionSurface(s);
    if (!grouped[surf]) grouped[surf] = [];
    grouped[surf].push(s);
  });

  // Surface sort order: named surfaces before subagent noise
  const surfaceOrder = ["discord", "telegram", "signal", "main", "subagent", "openai"];
  const sortedSurfaces = Object.keys(grouped).sort((a, b) => {
    const ai = surfaceOrder.indexOf(a);
    const bi = surfaceOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Total estimated cost across all visible sessions
  const totalCost = (sessions ?? []).reduce((sum, s) => sum + (s.costEst ?? 0), 0);

  return (
    <div className="section-content">
      <p className="section-intro">
        The threads Verdandi weaves right now — every active conversation across
        all surfaces, gathered at the Well.
      </p>

      {sessions != null && (
        <p className="threads-summary">
          {sessions.length} thread{sessions.length !== 1 ? "s" : ""} in the last 24 hours
          {totalCost > 0 && ` · ~$${totalCost.toFixed(3)} estimated`}
        </p>
      )}

      {loading && <p className="rune-loading">The threads are gathering…</p>}
      {error   && <p className="rune-error">{error}</p>}
      {!loading && sessions?.length === 0 && (
        <p className="threads-empty">No active threads in the last 24 hours. The Well is still.</p>
      )}

      {!loading && sortedSurfaces.map(surface => {
        const group = grouped[surface];
        // Collapse subagent group by default — usually a lot of them and less interesting
        const defaultOpen = surface !== "subagent" && surface !== "openai";
        return (
          <details key={surface} className="threads-group" open={defaultOpen}>
            <summary className="threads-group-name">
              <span aria-hidden="true">{SURFACE_ICON[surface] || SURFACE_ICON.default}</span>
              {" "}{surface}
              <span className="threads-group-count">{group.length}</span>
            </summary>
            <ul className="thread-list" aria-label={`${surface} threads`}>
              {group.map(s => <ThreadRow key={s.key} session={s} />)}
            </ul>
          </details>
        );
      })}

      <button className="btn-refresh" onClick={load} aria-label="Refresh thread list"
        style={{marginTop: "1rem"}}>
        ↻ Refresh
      </button>
    </div>
  );
}
