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
 * - /health endpoint: sandbox mode, security summary fields
 * - Future Phase 2: /api/security endpoint wrapping `openclaw doctor` output
 *
 * Accessibility:
 * - <details>/<summary> for collapsible audit categories (VoiceOver-native)
 * - <output> for live security status (live region, announced on change)
 * - <table> for audit results (genuinely tabular data — this IS the right use)
 */

// ── SecuritySummary ───────────────────────────────────────────────────────────
// Shows the current security posture at a glance using data from /health.
// This is the "everything is fine" or "something needs attention" view.
// Phase 2 will replace the static mock policy list with live gateway config.
function SecuritySummary({ health }) {
  // /health returns a top-level "security" object if the gateway exposes it.
  // Currently the Well daemon's /health proxies whatever the gateway returns.
  // If security fields aren't present, we show defaults that reflect safe unknowns
  // rather than falsely claiming everything is fine.
  const sec = health?.security || {};
  const isHealthy = health?.status === "healthy";

  return (
    <section aria-label="Security summary">
      <h3>Current posture</h3>

      {/* <output> as a live region — if security status changes (e.g. an approval
          comes in and the gateway restarts), VoiceOver will announce the new state
          without the user having to navigate here. */}
      <output className={`security-status ${isHealthy ? "ok" : "warn"}`}>
        <span className="dot" aria-hidden="true" />
        {isHealthy
          ? "The hearth burns steady — no threats at the door"
          : "The fire dims — check the gateway connection"}
      </output>

      {/* Security policy snapshot — shown as a definition list because
          these are key-value pairs: policy name → current value.
          <dl> gives VoiceOver natural "term, definition" reading. */}
      <dl className="stat-grid" style={{ marginTop: "0.75rem" }}>
        <dt>Sandbox mode</dt>
        <dd>{sec.sandboxMode ?? "—"}</dd>

        <dt>DM policy</dt>
        {/* DM policy controls who can message the agent directly.
            "pairing-required" means strangers can't cold-message the agent — 
            they must go through a pairing flow first. Safest default. */}
        <dd>{sec.dmPolicy ?? "—"}</dd>

        <dt>Auth token</dt>
        <dd>{sec.authToken ? "Active" : "—"}</dd>

        <dt>Last audit</dt>
        <dd>{sec.lastAudit ?? "—"}</dd>

        <dt>Open issues</dt>
        {/* Color the open issues count amber if non-zero to draw attention
            without being alarmist — not every open issue is critical. */}
        <dd className={sec.openIssues > 0 ? "ember" : "ok"}>
          {sec.openIssues ?? "—"}
        </dd>
      </dl>
    </section>
  );
}

// ── PendingApprovals ──────────────────────────────────────────────────────────
// This is where Zion/Atropos surfaces items that need a human decision.
// In the pipeline: Zion blocks something → drops a pending approval here.
// The user sees it as an <aside> WeaveNotice in The Hearth.
//
// Phase 1 (now): shows placeholder UI explaining the approval flow.
// Phase 3: connected to the Moirai pipeline data model, shows real items.
function PendingApprovals() {
  // Placeholder — will be replaced with live approval data from the Moirai pipeline.
  // The component structure here is the target shape even before it's wired.
  const pending = []; // Phase 3: populated from Moirai pipeline state

  return (
    <section aria-label="Pending approvals">
      <h3>Awaiting your hand</h3>

      {pending.length === 0 ? (
        // When there's nothing pending, say so clearly.
        // VoiceOver users shouldn't have to wonder if the list failed to load
        // or if it's genuinely empty.
        <p className="coming-soon-inline">
          Nothing awaiting approval. When Zion holds the shears, items appear here.
        </p>
      ) : (
        // Each approval is a <details> block:
        // - Collapsed: shows who's holding what and for how long
        // - Expanded: shows full request details and approve/deny buttons
        // This pattern is also used in The Moirai for the full pipeline view.
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
// Shows the output of `openclaw doctor` — the built-in health/security auditor.
// Phase 2: wired to a /api/doctor endpoint that runs the audit on demand.
// Currently shows what a clean audit looks like so the UI shape is established.
//
// WHY a <table> here: audit results are genuinely tabular — each row is a check,
// with columns for check name, status, and message. This is not layout, it's data.
function AuditResults() {
  // Mock data showing what a healthy audit looks like.
  // Phase 2 will replace this with live results from `openclaw doctor`.
  const mockResults = [
    { check: "Gateway reachable",    status: "pass", message: "Responding on configured port" },
    { check: "Auth token set",       status: "pass", message: "Token is configured" },
    { check: "Sandbox mode",         status: "pass", message: "non-main mode active" },
    { check: "DM policy",            status: "pass", message: "pairing-required" },
    { check: "Secrets audit",        status: "info", message: "Run `openclaw secrets audit` to verify" },
  ];

  return (
    <details className="audit-pane">
      <summary className="audit-heading">Doctor audit results</summary>
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
            {mockResults.map(r => (
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
      <p className="coming-soon-inline" style={{ marginTop: "0.75rem" }}>
        Live audit results from <code>openclaw doctor</code> coming in Phase 2.
      </p>
    </details>
  );
}

// ── TheHearth (root component) ────────────────────────────────────────────────
// Composes security summary, pending approvals, and audit results.
// Health data passed from App.jsx so no duplicate polling.
export default function TheHearth({ health }) {
  return (
    <div className="section-content hearth-section">
      <p className="section-desc">
        The fire at the center of the longhouse. Warmth and protection.
        Atropos stands watch here — when she holds the shears, you'll see it.
      </p>

      <SecuritySummary health={health} />
      <PendingApprovals />
      <AuditResults />
    </div>
  );
}
