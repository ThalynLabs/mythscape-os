/**
 * TheRunes.jsx — Configuration display for Urðarbrunnr
 *
 * "Runes are carved knowledge — the settings that shape how the Well speaks
 *  and what it permits." — WELL_OF_URD_SPEC.md
 *
 * Phase 1: read-only display of model, auth, sandbox, and identity files.
 * Phase 2: in-place editors for SOUL.md / AGENTS.md / USER.md with markdown preview.
 * Phase 3: WeaveNotice injection point for Zeus (Lachesis) spec change approvals.
 *
 * Data sources:
 *   /api/config  → model, agentModels, sandbox, dmPolicy, authMethod, phase
 *   /api/files   → SOUL.md · AGENTS.md · USER.md · MEMORY.md · TOOLS.md (read-only)
 *
 * Accessibility: all sections use <details>/<summary> for VoiceOver-native collapse.
 * No ARIA roles needed — semantic HTML handles the disclosure pattern natively.
 */

import { useState, useEffect } from "react";

// ── Config data hook ─────────────────────────────────────────────────────────
// Fetches /api/config once on mount. Retries are not needed — this is display data,
// not mission-critical. Stale config is better than a loading spinner that never clears.
function useConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetch("/api/config")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setConfig(d); })
      .catch(() => {});
  }, []);
  return config;
}

// ── Identity file viewer ─────────────────────────────────────────────────────
// Lazy-loads file content when the <details> is opened for the first time.
// This avoids fetching all five files on page load — most sessions only need one.
// The "loaded" flag prevents re-fetching on close/reopen.
function IdentityFilePane({ name }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  function handleToggle(e) {
    // Only fetch when opening, not closing, and only once.
    if (!e.target.open || content !== null || loading) return;
    setLoading(true);
    fetch(`/api/files?name=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setContent(d.content); setLoading(false); })
      .catch(err => { setError(`Could not load ${name}: ${err}`); setLoading(false); });
  }

  // Approximate line count for the size hint shown in the summary.
  // Gives VoiceOver users a sense of the file's scope before expanding.
  const lineHint = content != null
    ? `${content.split("\n").length.toLocaleString()} lines`
    : null;

  return (
    <details className="rune-file" onToggle={handleToggle}>
      <summary>
        {name}
        {lineHint && <span className="rune-file-meta">{lineHint}</span>}
      </summary>

      {loading && <p className="rune-loading">Reading the runes…</p>}
      {error   && <p className="rune-error">{error}</p>}
      {content != null && (
        <pre className="rune-file-content" tabIndex={0} aria-label={`Contents of ${name}`}>
          <code>{content}</code>
        </pre>
      )}
    </details>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function TheRunes({ health }) {
  const config = useConfig();

  // model may come back as a string (simple) or {primary, fallbacks} (chain config).
  // Normalise to a display string either way so we never hand React a raw object.
  const rawModel  = config?.model;
  const modelLabel = !rawModel
    ? "—"
    : typeof rawModel === "string"
    ? rawModel
    : rawModel.primary ?? "—";
  const fallbacks  = Array.isArray(rawModel?.fallbacks) ? rawModel.fallbacks : [];

  // Show sandbox state in human terms — "protected" / "open" rather than true/false.
  // Matches the mythic register: sandbox is not a technical detail, it's a ward.
  const sandboxLabel = config?.sandbox?.enabled
    ? "Warded — sandbox mode active"
    : config?.sandbox != null
    ? "Open — sandbox mode off"
    : "—";

  const dmLabel = config?.dmPolicy
    ? String(config.dmPolicy)
    : "—";

  return (
    <div className="section-content">
      {/* Opening text — sets the mythic register before the data. */}
      <p className="section-intro">
        Runes are carved knowledge. These are the settings that shape how the Well
        speaks, what the agents may touch, and who may approach the water.
      </p>

      {/* ── Gateway & model ── */}
      <section aria-labelledby="runes-model-heading" className="rune-section">
        <h3 id="runes-model-heading">The Voice of the Well</h3>
        <p className="rune-desc">Which model speaks through the tree, and how.</p>
        <dl className="stat-grid">
          <dt>Default model</dt>  <dd>{modelLabel}</dd>
          {fallbacks.length > 0 && <>
            <dt>Fallback chain</dt><dd>{fallbacks.join(" → ")}</dd>
          </>}
          <dt>Phase</dt>          <dd>{health?.phase    ?? config?.phase ?? "—"}</dd>
          <dt>Auth method</dt>    <dd>{config?.authMethod ?? "—"}</dd>
          <dt>DM policy</dt>      <dd>{dmLabel}</dd>
          <dt>Sandbox</dt>        <dd>{sandboxLabel}</dd>
        </dl>

        {/* Per-agent model overrides — only shown if any agent has a non-default model. */}
        {config?.agentModels && Object.keys(config.agentModels).length > 0 && (
          <details className="rune-sub">
            <summary>Agent model overrides</summary>
            <dl className="stat-grid" style={{marginTop: "0.5rem"}}>
              {Object.entries(config.agentModels).map(([agent, model]) => (
                <><dt key={`dt-${agent}`}>{agent}</dt><dd key={`dd-${agent}`}>{model}</dd></>
              ))}
            </dl>
          </details>
        )}
      </section>

      {/* ── Secrets ── */}
      <section aria-labelledby="runes-secrets-heading" className="rune-section">
        <h3 id="runes-secrets-heading">Sealed Knowledge</h3>
        <p className="rune-desc">
          API keys and credentials are never stored here — they live in OpenClaw's
          SecretRef system. Run <code>openclaw secrets configure</code> in your
          terminal to manage them.
        </p>
        <dl className="stat-grid">
          <dt>Key storage</dt>
          <dd>OpenClaw SecretRef — not in The Well's config</dd>
        </dl>
      </section>

      {/* ── Identity files ── */}
      {/* Read-only Phase 1. Phase 2 will add in-place editing with markdown preview.
          Files load lazily on first open so the page doesn't fetch 5 large files at once. */}
      <section aria-labelledby="runes-identity-heading" className="rune-section">
        <h3 id="runes-identity-heading">The Carved Names</h3>
        <p className="rune-desc">
          The identity files that shape who lives here. Read-only for now —
          editing comes in Phase 2.
        </p>

        <div className="rune-files">
          {["SOUL.md", "AGENTS.md", "USER.md", "TOOLS.md", "MEMORY.md"].map(name => (
            <IdentityFilePane key={name} name={name} />
          ))}
        </div>
      </section>
    </div>
  );
}
