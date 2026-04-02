/**
 * TheHearth.jsx — Security and health section
 *
 * Named after the hearth — the fire at the center of a longhouse that provides
 * warmth, light, and protection. In The Well, The Hearth is where security
 * lives: audits, policies, threat detection, and agent trust boundaries.
 *
 * WHY this section exists separately from The Runes (config):
 * The Runes is about *shaping* the agent — model, identity, preferences.
 * The Hearth is about *protecting* it — what's allowed in, what's blocked,
 * who has been approved, what the audit found. Runes = configuration.
 * Hearth = security posture. They're related but distinct concerns.
 *
 * Pipeline integration (Phase 3):
 * The Hearth is the primary landing zone for Zion/Atropos approvals.
 * When Zion blocks something, a WeaveNotice appears here as an <aside>.
 * The user sees it in context — "something is waiting at the hearth" —
 * rather than having to navigate to a separate pipeline section.
 *
 * Data sources:
 * - /api/security: exec enforcement mode, circuit breaker report, gateway health
 *
 * Accessibility:
 * - <details>/<summary> for collapsible audit categories (VoiceOver-native)
 * - <output> for live security status (live region, announced on change)
 * - <table> for audit results (genuinely tabular data — this IS the right use)
 * - <dl>/<dt>/<dd> for key-value pairs
 */

import { useState, useEffect, useCallback } from "react";

// ── useSecurity hook ──────────────────────────────────────────────────────────
// Fetches /api/security and polls every 60s. Self-contained — no health prop.
function useSecurity() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/security");
      if (!r.ok) { setError(`HTTP ${r.status}`); return; }
      const d = await r.json();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [poll]);

  return { data, loading, error };
}

// ── SecuritySummary ───────────────────────────────────────────────────────────
// Shows the current security posture using live data from /api/security.
// Exec enforcement defaults + per-agent modes displayed as <dl>.
function SecuritySummary({ security }) {
  const approvals = security?.execApprovals;
  const defaults_ = approvals?.defaults || {};
  const agents = approvals?.agents || {};
  const gwHealth = security?.gatewayHealth?.status || "unknown";

  return (
    <section aria-label="Security summary">
      <h3>Current posture</h3>

      {/* <output> as a live region — if security status changes, VoiceOver
          will announce the new state without the user navigating here. */}
      <output className={`security-status ${gwHealth === "healthy" ? "ok" : "warn"}`}>
        <span className="dot" aria-hidden="true" />
        {gwHealth === "healthy"
          ? "The hearth burns steady — no threats at the door"
          : "The fire dims — check the gateway connection"}
      </output>

      {/* Exec enforcement defaults */}
      <h4 style={{ marginTop: "0.75rem" }}>Exec enforcement</h4>
      <dl className="stat-grid">
        <dt>Default security</dt>
        <dd>{defaults_.security ?? "—"}</dd>
        <dt>Default ask mode</dt>
        <dd>{defaults_.ask ?? "—"}</dd>
        <dt>Auto-allow skills</dt>
        <dd>{defaults_.autoAllowSkills != null ? String(defaults_.autoAllowSkills) : "—"}</dd>
      </dl>

      {/* Per-agent modes */}
      {Object.keys(agents).length > 0 && (
        <>
          <h4 style={{ marginTop: "0.75rem" }}>Per-agent modes</h4>
          <dl className="stat-grid">
            {Object.entries(agents).map(([agentId, cfg]) => (
              <div key={agentId} style={{ display: "contents" }}>
                <dt>{agentId}</dt>
                <dd>
                  {cfg.security ?? "—"}
                  {cfg.allowlistCount != null ? ` (${cfg.allowlistCount} allowlisted)` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {!approvals && (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Exec approvals file not found or unreadable.
        </p>
      )}
    </section>
  );
}

// ── PendingApprovals ──────────────────────────────────────────────────────────
// This is where Zion/Atropos surfaces items that need a human decision.
// In the pipeline: Zion blocks something → drops a pending approval here.
//
// Phase 1 (now): shows placeholder UI explaining the approval flow.
// Phase 3: connected to the Moirai pipeline data model, shows real items.
function PendingApprovals() {
  // Placeholder — will be replaced with live approval data from the Moirai pipeline.
  const pending = []; // Phase 3: populated from Moirai pipeline state

  return (
    <section aria-label="Pending approvals">
      <h3>Awaiting your hand</h3>

      {pending.length === 0 ? (
        <p className="coming-soon-inline">
          Nothing awaiting approval. When Zion holds the shears, items appear here.
        </p>
      ) : (
        <ul className="approval-list">
          {pending.map(item => (
            <li key={item.id}>
              <details className="approval-item">
                <summary>
                  Atropos holds: {item.description} — {item.age}
                </summary>
                <div className="approval-body">
                  <p>{item.detail}</p>
                  <div className="approval-actions">
                    <button type="button" className="btn-approve">Approve</button>
                    <button type="button" className="btn-deny">Deny</button>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── AuditResults ──────────────────────────────────────────────────────────────
// Shows live security checks derived from /api/security data.
// WHY a <table>: audit results are genuinely tabular — each row is a check
// with columns for name, status, and message.
function AuditResults({ security }) {
  const gwHealth = security?.gatewayHealth?.status || "unknown";
  const approvals = security?.execApprovals;
  const defaults_ = approvals?.defaults || {};
  const cb = security?.circuitBreaker;

  const checks = [
    {
      check: "Gateway reachable",
      status: gwHealth === "healthy" ? "pass" : "fail",
      message: gwHealth === "healthy" ? "Responding on configured port" : "Gateway unreachable",
    },
    {
      check: "Exec enforcement active",
      status: approvals ? "pass" : "warn",
      message: approvals
        ? `Mode: ${defaults_.security ?? "unknown"}`
        : "exec-approvals.json not found",
    },
    {
      check: "Circuit breaker",
      status: cb ? (cb.anomaly_count === 0 ? "pass" : "warn") : "info",
      message: cb
        ? (cb.anomaly_count === 0
            ? `Clean — ${cb.anomaly_count} anomalies`
            : `${cb.anomaly_count} anomalies detected`)
        : "No recent scans",
    },
    {
      check: "Anomaly count",
      status: cb
        ? (cb.high_count > 0 ? "fail" : cb.medium_count > 0 ? "warn" : "pass")
        : "info",
      message: cb
        ? `High: ${cb.high_count ?? 0} · Medium: ${cb.medium_count ?? 0}`
        : "No data",
    },
  ];

  return (
    <details className="audit-pane">
      <summary className="audit-heading">Live security checks</summary>
      <div style={{ overflowX: "auto" }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Status</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {checks.map(r => (
              <tr key={r.check}>
                <td>{r.check}</td>
                <td>
                  <span className={`audit-status ${r.status}`}>
                    {r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "ℹ"}
                    {" "}{r.status}
                  </span>
                </td>
                <td className="muted">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cb?.scan_time_utc && (
        <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.8em" }}>
          Last scan: {new Date(cb.scan_time_utc).toLocaleString()}
        </p>
      )}
    </details>
  );
}

// ── TheHearth (root component) ────────────────────────────────────────────────
// Self-contained — fetches its own security data. No health prop needed.
export default function TheHearth() {
  const { data, loading, error } = useSecurity();

  return (
    <div className="section-content hearth-section">
      <p className="section-desc">
        The fire at the center of the longhouse. Warmth and protection.
        Atropos stands watch here — when she holds the shears, you'll see it.
      </p>

      {loading && <p className="muted">Reading the security posture…</p>}
      {error && !loading && (
        <output className="court-error" role="alert">
          Could not load security data: {error}
        </output>
      )}

      {!loading && <SecuritySummary security={data} />}
      <PendingApprovals />
      {!loading && <AuditResults security={data} />}
    </div>
  );
}
