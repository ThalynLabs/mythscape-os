/**
 * TheMoirai.jsx — Pipeline visibility panel
 *
 * The three Greek Fates tend the pipeline:
 *   Clotho  (the Spinner)  — delivery queue: messages being woven, those that failed
 *   Lachesis (the Measurer) — subagent run history: tasks dispatched, their outcomes
 *   Atropos  (the Shear-holder) — pending approvals (see also The Hearth)
 *
 * "The Moirai hold the threads of every action taken in the castle.
 *  Clotho spins them. Lachesis measures them. Atropos cuts them."
 *
 * Data sources:
 *   /api/moirai/delivery-failed  — failed delivery queue items (Clotho)
 *   /api/moirai/subagent-runs    — subagent run history (Lachesis)
 *
 * Accessibility:
 *   <details>/<summary> for each fate's section (VoiceOver-native disclosure)
 *   <dl>/<dt>/<dd> for run and delivery metadata
 *   <output role="status"> for live loading states
 *   No ARIA beyond what semantic HTML provides
 */

import { useState, useEffect, useCallback } from "react";

// ── useDeliveryFailed ────────────────────────────────────────────────────────
function useDeliveryFailed() {
  const [items, setItems] = useState(null);
  const [err, setErr]     = useState(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/moirai/delivery-failed");
      const d = await r.json();
      if (d.ok) { setItems(d.items); setErr(null); }
      else setErr(d.error || "Unknown error");
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [poll]);

  return { items, err };
}

// ── useSubagentRuns ──────────────────────────────────────────────────────────
function useSubagentRuns() {
  const [runs, setRuns] = useState(null);
  const [err, setErr]   = useState(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/moirai/subagent-runs");
      const d = await r.json();
      if (d.ok) { setRuns(d.runs); setErr(null); }
      else setErr(d.error || "Unknown error");
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [poll]);

  return { runs, err };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function relativeTime(ms) {
  if (!ms) return "unknown";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return "just now";
}

function durationLabel(createdAt, endedAt) {
  if (!createdAt || !endedAt) return null;
  const ms = endedAt - createdAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// ── Clotho — delivery failures ───────────────────────────────────────────────
function ClothoView() {
  const { items, err } = useDeliveryFailed();

  return (
    <details className="moirai-fate" open>
      <summary className="moirai-fate-heading">
        Clotho — the delivery thread
        {items != null && items.length > 0 && (
          <span className="moirai-count moirai-count-warn">
            {items.length} failed
          </span>
        )}
        {items != null && items.length === 0 && (
          <span className="moirai-count moirai-count-ok">clear</span>
        )}
      </summary>

      <p className="moirai-fate-desc">
        Messages Clotho could not deliver — the threads that broke mid-weave.
      </p>

      {err && (
        <output className="court-error" role="alert">
          Could not load delivery queue: {err}
        </output>
      )}
      {!err && !items && (
        <p className="muted">Reading the loom…</p>
      )}
      {items && items.length === 0 && (
        <p className="muted">The thread holds — no failed deliveries.</p>
      )}
      {items && items.length > 0 && (
        <ul className="moirai-run-list" role="list" aria-label="Failed deliveries">
          {items.map(item => (
            <li key={item.id} className="moirai-run-item">
              <details className="moirai-run-detail">
                <summary className="moirai-run-summary">
                  <span className="moirai-run-channel">{item.channel}</span>
                  {" — "}
                  <span className="muted">{relativeTime(item.enqueuedAt)}</span>
                  {item.retryCount > 0 && (
                    <span className="moirai-retry"> · {item.retryCount} retr{item.retryCount === 1 ? "y" : "ies"}</span>
                  )}
                </summary>
                <dl className="moirai-run-dl">
                  <dt>To</dt>
                  <dd className="muted">{item.to || "—"}</dd>
                  <dt>Error</dt>
                  <dd className="moirai-error-text">{item.lastError || "—"}</dd>
                  {item.textPreview && (
                    <>
                      <dt>Message</dt>
                      <dd className="muted">{item.textPreview}{item.textPreview.length >= 120 ? "…" : ""}</dd>
                    </>
                  )}
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

// ── Lachesis — subagent runs ─────────────────────────────────────────────────
function LachesisView() {
  const { runs, err } = useSubagentRuns();

  return (
    <details className="moirai-fate" open>
      <summary className="moirai-fate-heading">
        Lachesis — the measured tasks
        {runs != null && (
          <span className="moirai-count moirai-count-neutral">{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
        )}
      </summary>

      <p className="moirai-fate-desc">
        Tasks dispatched to sub-agents — each thread measured by Lachesis,
        its beginning and ending recorded in the loom.
      </p>

      {err && (
        <output className="court-error" role="alert">
          Could not load subagent runs: {err}
        </output>
      )}
      {!err && !runs && (
        <p className="muted">Counting the threads…</p>
      )}
      {runs && runs.length === 0 && (
        <p className="muted">No subagent runs recorded yet.</p>
      )}
      {runs && runs.length > 0 && (
        <ul className="moirai-run-list" role="list" aria-label="Subagent runs">
          {runs.map(run => {
            const statusClass = run.status === "ok" ? "ok" : run.status === "error" ? "fail" : "info";
            const dur = durationLabel(run.createdAt, run.endedAt);
            return (
              <li key={run.runId} className="moirai-run-item">
                <details className="moirai-run-detail">
                  <summary className="moirai-run-summary">
                    <span className="moirai-run-label">{run.label || run.runId.slice(0, 8)}</span>
                    {" — "}
                    <span className={`audit-status ${statusClass}`}>
                      {run.status === "ok" ? "✓" : run.status === "error" ? "✗" : "·"} {run.status}
                    </span>
                    {" · "}
                    <span className="muted">{relativeTime(run.createdAt)}</span>
                  </summary>
                  <dl className="moirai-run-dl">
                    {run.agent && <><dt>Agent</dt><dd>{run.agent}</dd></>}
                    {run.model && <><dt>Model</dt><dd className="muted">{run.model}</dd></>}
                    {dur && <><dt>Duration</dt><dd className="muted">{dur}</dd></>}
                    {run.spawnMode && <><dt>Mode</dt><dd className="muted">{run.spawnMode}</dd></>}
                    {run.task && (
                      <>
                        <dt>Task</dt>
                        <dd className="moirai-task-preview">{run.task}{run.task.length >= 200 ? "…" : ""}</dd>
                      </>
                    )}
                  </dl>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}

// ── Atropos — pending approvals ──────────────────────────────────────────────
// Phase 1: placeholder pointing to The Hearth for exec posture.
// Phase 3: connect to a real approval queue when the pipeline is built.
function AtroposView() {
  return (
    <details className="moirai-fate">
      <summary className="moirai-fate-heading">
        Atropos — awaiting the shears
        <span className="moirai-count moirai-count-ok">none pending</span>
      </summary>

      <p className="moirai-fate-desc">
        When an action requires your hand before it can proceed, it waits here.
        Atropos holds the shears — nothing cuts without her word.
      </p>

      <p className="muted">
        No items pending approval. For exec enforcement posture, see{" "}
        <em>The Hearth</em>.
      </p>
    </details>
  );
}

// ── TheMoirai (root) ─────────────────────────────────────────────────────────
export default function TheMoirai() {
  return (
    <div className="section-content moirai-section">
      <p className="section-intro">
        Three Fates hold the threads of every action in the castle.
        Clotho spins what is sent. Lachesis measures what was dispatched.
        Atropos holds what must not proceed without your word.
      </p>

      <ClothoView />
      <LachesisView />
      <AtroposView />
    </div>
  );
}
