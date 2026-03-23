/**
 * FixturePanel — DRM Lure + Injection Resistance fixture management
 *
 * Lives in The Well UI under Brain section (TheNorns), alongside Skuld.
 * Two tabs: DRM Lures | Injection Fixtures
 *
 * Features per tab:
 *   - List all fixtures (content, category, active/inactive, created, last tested)
 *   - Add new fixture (text + save)
 *   - Retire fixture (mark inactive — never delete)
 *   - Last tested date + result (pass/fail)
 *   - "Run gate suite now" button (sandboxed)
 *
 * Fixtures are human-authored only — no AI generation here.
 * Content is immutable after creation (retire and create new to replace).
 */

import { useState, useEffect, useCallback } from "react";

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

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(ts) {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── AddFixtureForm ────────────────────────────────────────────────────────────
function AddFixtureForm({ type, onAdded, onCancel }) {
  const [content,  setContent]  = useState("");
  const [notes,    setNotes]    = useState("");
  const [category, setCategory] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  const isInjection = type === "injection";
  const label       = isInjection ? "Injection fixture" : "DRM lure";
  const placeholder = isInjection
    ? "Enter adversarial conversation snippet (multi-line)…"
    : "Enter the plausible-but-false statement…";

  async function handleSave() {
    if (!content.trim()) {
      setError("Content is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await brainFetch("/test-fixtures", {
        method: "POST",
        body: { type, content: content.trim(), notes: notes.trim() || null, category: category.trim() || null },
      });
      onAdded(data.fixture);
      setContent(""); setNotes(""); setCategory("");
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    }
    setSaving(false);
  }

  return (
    <div className="fixture-add-form">
      <h4>Add new {label}</h4>
      {error && <p className="rune-error">{error}</p>}

      <label htmlFor={`fixture-content-${type}`}>Content <em>(immutable after save)</em></label>
      {isInjection ? (
        <textarea
          id={`fixture-content-${type}`}
          rows={4}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          className="fixture-content-input"
        />
      ) : (
        <input
          id={`fixture-content-${type}`}
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          className="fixture-content-input"
        />
      )}

      <label htmlFor={`fixture-category-${type}`}>Category (optional)</label>
      <input
        id={`fixture-category-${type}`}
        type="text"
        value={category}
        onChange={e => setCategory(e.target.value)}
        placeholder={isInjection ? "e.g. social_proof, you_are_statement" : "e.g. personality, preferences"}
        disabled={saving}
        className="fixture-meta-input"
      />

      <label htmlFor={`fixture-notes-${type}`}>Notes (optional)</label>
      <input
        id={`fixture-notes-${type}`}
        type="text"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Why this fixture exists, what it tests…"
        disabled={saving}
        className="fixture-meta-input"
      />

      <div className="fixture-form-actions">
        <button className="btn-primary" onClick={handleSave} disabled={saving || !content.trim()}>
          {saving ? "Saving…" : "Save fixture"}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── FixtureItem ────────────────────────────────────────────────────────────────
function FixtureItem({ fixture, onRetire }) {
  const [confirming, setConfirming] = useState(false);
  const [retiring,   setRetiring]   = useState(false);

  async function handleRetire() {
    setRetiring(true);
    try {
      await brainFetch(`/test-fixtures/${fixture.id}`, {
        method: "PATCH",
        body: { active: false },
      });
      onRetire(fixture.id);
    } catch (e) {
      console.error("[FixtureItem] retire failed:", e.message);
    }
    setRetiring(false);
    setConfirming(false);
  }

  const resultClass = fixture.last_result === "pass"
    ? "fixture-result-pass"
    : fixture.last_result === "fail"
    ? "fixture-result-fail"
    : "fixture-result-none";

  return (
    <li className={`fixture-item${fixture.active ? "" : " fixture-inactive"}`}>
      <div className="fixture-item-header">
        {fixture.category && (
          <span className="norns-badge norns-badge-cat">{fixture.category}</span>
        )}
        {fixture.external_id && (
          <span className="fixture-external-id">{fixture.external_id}</span>
        )}
        {!fixture.active && (
          <span className="fixture-retired-badge">Retired</span>
        )}
      </div>

      <p className="fixture-content">{fixture.content}</p>

      {fixture.notes && (
        <p className="fixture-notes">{fixture.notes}</p>
      )}

      <div className="fixture-meta-row">
        <span>Added {fmtDate(fixture.created_at)}</span>
        {fixture.last_tested_at ? (
          <>
            <span> &middot; Last tested {fmtRelative(fixture.last_tested_at)}</span>
            <span className={`fixture-result ${resultClass}`}>
              {fixture.last_result === "pass" ? " ✓ Pass" : fixture.last_result === "fail" ? " ✗ Fail" : " — Untested"}
            </span>
          </>
        ) : (
          <span className="fixture-result fixture-result-none"> — Never tested</span>
        )}
      </div>

      {fixture.active && !confirming && (
        <button
          className="fixture-retire-btn"
          onClick={() => setConfirming(true)}
        >
          Retire
        </button>
      )}

      {confirming && (
        <div className="fixture-retire-confirm">
          <span>Retire this fixture? It will be kept in history but excluded from gate suite runs.</span>
          <button className="btn-primary" onClick={handleRetire} disabled={retiring}>
            {retiring ? "Retiring…" : "Confirm retire"}
          </button>
          <button className="btn-secondary" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}

// ── FixtureTab ─────────────────────────────────────────────────────────────────
function FixtureTab({ type, fixtures, onFixtureAdded, onFixtureRetired, minCount }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const active   = fixtures.filter(f => f.active);
  const retired  = fixtures.filter(f => !f.active);
  const shown    = showAll ? fixtures : active;
  const label    = type === "lure" ? "DRM lures" : "Injection fixtures";
  const meetsMin = minCount == null || active.length >= minCount;

  return (
    <div className="fixture-tab-content">
      {/* Threshold indicator for lures */}
      {minCount != null && (
        <div className={`fixture-threshold-bar${meetsMin ? " meets" : " short"}`}>
          <span>
            {active.length} active {label}
            {!meetsMin && ` — minimum ${minCount} required for T1.F1`}
            {meetsMin && ` ✓ (minimum ${minCount})`}
          </span>
        </div>
      )}

      {/* Add form */}
      {showAdd ? (
        <AddFixtureForm
          type={type}
          onAdded={f => { onFixtureAdded(f); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button className="btn-primary fixture-add-btn" onClick={() => setShowAdd(true)}>
          + Add {type === "lure" ? "lure" : "injection fixture"}
        </button>
      )}

      {/* Fixture list */}
      {shown.length === 0 ? (
        <p className="coming-soon-inline">
          No {showAll ? "" : "active"} {label}. Add one above.
        </p>
      ) : (
        <ul className="fixture-list">
          {shown.map(f => (
            <FixtureItem
              key={f.id}
              fixture={f}
              onRetire={id => onFixtureRetired(id)}
            />
          ))}
        </ul>
      )}

      {/* Toggle retired */}
      {retired.length > 0 && (
        <button
          className="fixture-toggle-retired"
          onClick={() => setShowAll(s => !s)}
        >
          {showAll ? `Hide ${retired.length} retired` : `Show ${retired.length} retired`}
        </button>
      )}
    </div>
  );
}

// ── GateSuiteRunner ────────────────────────────────────────────────────────────
function GateSuiteRunner() {
  const [running,    setRunning]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const data = await brainFetch("/gate-suite/run", { method: "POST" });
      setResult(data);
    } catch (e) {
      setError(`Gate suite run failed: ${e.message}`);
    }
    setRunning(false);
  }

  return (
    <div className="gate-suite-runner">
      <button
        className="btn-primary gate-suite-btn"
        onClick={handleRun}
        disabled={running}
      >
        {running ? "Running gate suite…" : "Run gate suite now (sandboxed)"}
      </button>
      {error && <p className="rune-error">{error}</p>}
      {result && (
        <div className="gate-suite-result">
          <p className={result.all_pass ? "gate-result-pass" : "gate-result-fail"}>
            {result.all_pass
              ? "✓ All 7 gate checks passed"
              : `✗ ${result.failed_checks?.length || 0} check(s) failed: ${(result.failed_checks || []).join(", ")}`}
          </p>
          {result.completed_at && (
            <p className="norns-result-meta">Completed {fmtDate(result.completed_at)}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── FixturePanel (root export) ─────────────────────────────────────────────────
export default function FixturePanel() {
  const [fixtures, setFixtures] = useState({ lures: [], injections: [] });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [tab,      setTab]      = useState("lures");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await brainFetch("/test-fixtures", {
        params: { active: "all" },
      });
      setFixtures({
        lures:      data.lures?.items      || [],
        injections: data.injections?.items || [],
      });
    } catch (e) {
      setError(`Could not load fixtures: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAdded(fixture) {
    setFixtures(prev => ({
      ...prev,
      lures:      fixture.type === "lure"      ? [...prev.lures, fixture]      : prev.lures,
      injections: fixture.type === "injection" ? [...prev.injections, fixture] : prev.injections,
    }));
  }

  function handleRetired(id) {
    // Mark the fixture inactive in local state
    const markRetired = list => list.map(f => f.id === id ? { ...f, active: false } : f);
    setFixtures(prev => ({
      lures:      markRetired(prev.lures),
      injections: markRetired(prev.injections),
    }));
  }

  return (
    <details className="norn-pane fixture-panel">
      <summary className="norn-heading">
        <span className="norn-name">Fixtures</span>
        <span className="norn-role">
          DRM lures &middot; Injection resistance
          {fixtures.lures.filter(f => f.active).length > 0 && (
            <span className="norns-pending-count">{fixtures.lures.filter(f => f.active).length}L</span>
          )}
          {fixtures.injections.filter(f => f.active).length > 0 && (
            <span className="norns-pending-count">{fixtures.injections.filter(f => f.active).length}I</span>
          )}
        </span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Human-authored test fixtures for Phase 4 gate checks.
          DRM lures are facts that must never be anchored.
          Injection fixtures are adversarial conversation snippets.
          All tests run sandboxed — never against the production anchor store.
        </p>

        {error && <p className="rune-error">{error}</p>}

        <GateSuiteRunner />

        {/* Tab selector */}
        <div className="fixture-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "lures"}
            className={`fixture-tab-btn${tab === "lures" ? " active" : ""}`}
            onClick={() => setTab("lures")}
          >
            DRM Lures ({fixtures.lures.filter(f => f.active).length})
          </button>
          <button
            role="tab"
            aria-selected={tab === "injections"}
            className={`fixture-tab-btn${tab === "injections" ? " active" : ""}`}
            onClick={() => setTab("injections")}
          >
            Injection Fixtures ({fixtures.injections.filter(f => f.active).length})
          </button>
        </div>

        {loading ? (
          <p className="rune-loading">Loading fixtures…</p>
        ) : (
          <div role="tabpanel">
            {tab === "lures" ? (
              <FixtureTab
                type="lure"
                fixtures={fixtures.lures}
                onFixtureAdded={handleAdded}
                onFixtureRetired={handleRetired}
                minCount={10}
              />
            ) : (
              <FixtureTab
                type="injection"
                fixtures={fixtures.injections}
                onFixtureAdded={handleAdded}
                onFixtureRetired={handleRetired}
              />
            )}
          </div>
        )}

        <button className="btn-refresh" onClick={load} style={{ marginTop: "0.5rem" }}>
          Refresh fixtures
        </button>
      </div>
    </details>
  );
}
