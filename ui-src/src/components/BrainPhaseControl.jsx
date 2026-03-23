/**
 * BrainPhaseControl — Manual phase control for The Brain
 *
 * Two forms:
 *   1. Full panel (used in TheNorns Brain section)
 *   2. HeaderIndicator (persistent header badge — "Brain: Phase 4 ▾")
 *
 * Interaction pattern:
 *   1. Click phase dropdown or header badge
 *   2. Select target phase
 *   3. Single confirm dialog — no required reason field
 *   4. Optional notes field logged to operational record
 *   5. Done
 *
 * All phase changes logged with manual_switch or auto_demotion tag.
 * If Valerie is manually dropping frequently, that pattern surfaces in Skuld.
 */

import { useState, useEffect, useCallback, useRef } from "react";

const PHASES = [
  { value: "shadow", label: "Shadow",  desc: "Read-only monitoring. No autonomous writes." },
  { value: "2",      label: "Phase 2", desc: "Supervised. All writes require review." },
  { value: "3",      label: "Phase 3", desc: "Assisted. Writes reviewed on schedule." },
  { value: "4",      label: "Phase 4", desc: "Autonomous. Full consolidation pipeline active." },
];

const PHASE_LABELS = Object.fromEntries(PHASES.map(p => [p.value, p.label]));

async function brainFetch(path, opts = {}) {
  const { method = "GET", body, params } = opts;
  let url = `/api/brain${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }
  const fetchOpts = { method, headers: {} };
  if (body) {
    fetchOpts.headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(body);
  }
  const r = await fetch(url, fetchOpts);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status}: ${text}`);
  }
  return r.json();
}

/**
 * useBrainPhase — fetches and mutates the current Brain phase.
 */
function useBrainPhase() {
  const [phase,      setPhase]      = useState(null);
  const [updatedAt,  setUpdatedAt]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await brainFetch("/phase");
      setPhase(data.phase);
      setUpdatedAt(data.updated_at);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const switchPhase = useCallback(async (newPhase, notes) => {
    const data = await brainFetch("/phase", {
      method: "PUT",
      body: {
        phase:  newPhase,
        reason: notes || null,
        tag:    "manual_switch",
      },
    });
    setPhase(data.phase);
    setUpdatedAt(new Date().toISOString());
    return data;
  }, []);

  return { phase, updatedAt, loading, error, reload: load, switchPhase };
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
// Single confirm dialog. No bureaucratic friction. Notes optional.
function ConfirmDialog({ targetPhase, onConfirm, onCancel }) {
  const [notes, setNotes] = useState("");
  const [busy,  setBusy]  = useState(false);

  const phaseInfo = PHASES.find(p => p.value === targetPhase);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm(notes || null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phase-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Switch Brain phase">
      <div className="phase-dialog">
        <h2 className="phase-dialog-title">Switch to {phaseInfo?.label || targetPhase}?</h2>
        <p className="phase-dialog-desc">
          {phaseInfo?.desc || "The Brain will operate in this mode until you change it."}
        </p>

        <div className="phase-dialog-notes">
          <label htmlFor="phase-notes">Notes (optional — logged to operational record)</label>
          <input
            id="phase-notes"
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Why switching now…"
            disabled={busy}
            autoFocus
          />
        </div>

        <div className="phase-dialog-actions">
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Switching…" : "Confirm"}
          </button>
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BrainPhaseControl (full panel) ────────────────────────────────────────────
// Used inside TheNorns Brain section.
export function BrainPhaseControl() {
  const { phase, updatedAt, loading, error, reload, switchPhase } = useBrainPhase();
  const [confirming, setConfirming] = useState(null);   // target phase pending confirmation
  const [feedback,   setFeedback]   = useState(null);   // success/error feedback

  async function handleSelect(e) {
    const target = e.target.value;
    if (target === phase) return;
    setConfirming(target);
  }

  async function handleConfirm(notes) {
    try {
      await switchPhase(confirming, notes);
      setFeedback({ ok: true, text: `Switched to ${PHASE_LABELS[confirming] || confirming}` });
    } catch (err) {
      setFeedback({ ok: false, text: `Switch failed: ${err.message}` });
    }
    setConfirming(null);
    setTimeout(() => setFeedback(null), 4000);
  }

  return (
    <section aria-label="Brain phase control" className="phase-control-panel">
      <h3>Phase control</h3>

      {error && <p className="rune-error">Could not load phase: {error}</p>}
      {feedback && (
        <p className={feedback.ok ? "phase-feedback-ok" : "rune-error"}>{feedback.text}</p>
      )}

      <div className="phase-control-row">
        <label htmlFor="brain-phase-select">Current phase:</label>
        {loading ? (
          <span className="rune-loading">Loading…</span>
        ) : (
          <select
            id="brain-phase-select"
            value={phase || "shadow"}
            onChange={handleSelect}
            aria-label="Brain operational phase"
          >
            {PHASES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        )}
        <button
          className="btn-refresh"
          onClick={reload}
          aria-label="Reload phase"
          style={{ marginLeft: "0.5rem" }}
        >
          ↺
        </button>
      </div>

      {phase && (
        <p className="phase-control-desc">
          {PHASES.find(p => p.value === phase)?.desc}
          {updatedAt && <span className="norns-result-meta"> &middot; changed {
            (() => {
              const diff = Date.now() - new Date(updatedAt).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 1) return "just now";
              if (mins < 60) return `${mins}m ago`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}h ago`;
              return `${Math.floor(hrs / 24)}d ago`;
            })()
          }</span>}
        </p>
      )}

      {confirming && (
        <ConfirmDialog
          targetPhase={confirming}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
}

// ── BrainPhaseHeaderIndicator — persistent header badge ───────────────────────
// One click from anywhere. Opens a quick-switch popover.
// Usage in App.jsx header: <BrainPhaseHeaderIndicator />
export function BrainPhaseHeaderIndicator() {
  const { phase, loading, switchPhase } = useBrainPhase();
  const [open,       setOpen]       = useState(false);
  const [confirming, setConfirming] = useState(null);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(target) {
    if (target === phase) { setOpen(false); return; }
    setConfirming(target);
    setOpen(false);
  }

  async function handleConfirm(notes) {
    try {
      await switchPhase(confirming, notes);
    } catch (err) {
      console.error("[BrainPhaseHeaderIndicator] switch failed:", err.message);
    }
    setConfirming(null);
  }

  const phaseLabel = loading ? "…" : (PHASE_LABELS[phase] || phase || "Shadow");
  const phaseClass = `phase-indicator phase-indicator-${phase || "shadow"}`;

  return (
    <div className="phase-header-wrap" ref={ref}>
      <button
        className={phaseClass}
        onClick={() => setOpen(o => !o)}
        aria-label={`Brain: ${phaseLabel} — click to switch`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Brain: {phaseLabel} <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="phase-popover" role="listbox" aria-label="Select Brain phase">
          {PHASES.map(p => (
            <button
              key={p.value}
              role="option"
              aria-selected={p.value === phase}
              className={`phase-popover-option${p.value === phase ? " active" : ""}`}
              onClick={() => handleSelect(p.value)}
            >
              <span className="phase-popover-label">{p.label}</span>
              <span className="phase-popover-desc">{p.desc}</span>
            </button>
          ))}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          targetPhase={confirming}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

export default BrainPhaseControl;
