/**
 * TheVoice.jsx — TTS configuration for Urðarbrunnr
 *
 * "The gods do not shout. They speak, and the world listens."
 *
 * Shows the voice infrastructure: sag status, ElevenLabs key presence,
 * agent voice table (Sethren / Thalyn / Zion), and verbal mode status.
 *
 * Data source: /api/voice → reads TOOLS.md + checks sag binary + el key
 *
 * Phase 2: verbal mode toggle (via gateway), test-speak button, voice picker.
 */

import { useState, useEffect, useCallback } from "react";

// ── Voice row in the agent table ──────────────────────────────────────────────
function VoiceRow({ v }) {
  return (
    <tr>
      <td className="voice-agent">{v.agent}</td>
      <td className="voice-id">
        <code>{v.voice_id}</code>
      </td>
      <td className="voice-model">{v.model}</td>
    </tr>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ ok, label }) {
  return (
    <span className={`voice-pill ${ok ? "voice-pill--ok" : "voice-pill--warn"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TheVoice() {
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/voice")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setError(null); setLoading(false); })
      .catch(e => { setError(`Could not read the voice: ${e}`); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="section-content">
      <p className="section-intro">
        Galdr — the Old Norse art of speaking power into the world.
        Each agent speaks with a different voice. These are the instruments —
        the ElevenLabs voices that carry words into the world. Verbal mode
        turns conversation into speech; the voice shapes how it lands.
      </p>

      {loading && <p className="rune-loading">The voices are stirring…</p>}
      {error   && <p className="rune-error">{error}</p>}

      {!loading && data && (
        <>
          {/* ── Infrastructure status ── */}
          <section aria-labelledby="voice-infra-heading">
            <h3 id="voice-infra-heading" className="voice-section-heading">Infrastructure</h3>
            <div className="voice-pills">
              <StatusPill ok={data.sag_ready} label="sag" />
              <StatusPill ok={data.el_key}    label="ElevenLabs key" />
            </div>
            {!data.sag_ready && (
              <p className="voice-hint">
                Install sag: <code>brew install steipete/tap/sag</code>
              </p>
            )}
          </section>

          {/* ── Verbal mode ── */}
          <section aria-labelledby="voice-verbal-heading" style={{marginTop: "1.25rem"}}>
            <h3 id="voice-verbal-heading" className="voice-section-heading">Verbal mode</h3>
            <p className="voice-verbal-status">
              <span className="voice-verbal-label">State:</span>
              <span className="voice-verbal-value">{data.verbal_mode}</span>
            </p>
            <p className="voice-hint">
              Say <strong>go verbal</strong> to Sethren to activate · <strong>go nonverbal</strong> to deactivate.
              Phase 2 will add a toggle here.
            </p>
          </section>

          {/* ── Agent voice table ── */}
          {data.voices?.length > 0 && (
            <section aria-labelledby="voice-agents-heading" style={{marginTop: "1.25rem"}}>
              <h3 id="voice-agents-heading" className="voice-section-heading">Agent voices</h3>
              {/*
               * PATTERN: table-for-structured-data
               * ELEMENT: <table> with <caption>
               * WHY: Three-column structured data (agent / voice ID / model) IS
               *      a genuine table. VoiceOver reads column headers with each cell.
               * VOICEOVER READS: "Agent, column 1. Sethren. Voice ID, column 2. prPr3Z..."
               */}
              <div className="voice-table-wrap">
                <table className="voice-table">
                  <caption className="sr-only">Agent voice assignments</caption>
                  <thead>
                    <tr>
                      <th scope="col">Agent</th>
                      <th scope="col">Voice ID</th>
                      <th scope="col">Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.voices.map(v => <VoiceRow key={v.agent} v={v} />)}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Default voice ── */}
          {data.default?.voice_id && (
            <section aria-labelledby="voice-default-heading" style={{marginTop: "1.25rem"}}>
              <h3 id="voice-default-heading" className="voice-section-heading">Default</h3>
              <dl className="root-meta">
                <dt>Provider</dt><dd>{data.default.provider || "ElevenLabs"}</dd>
                <dt>Voice ID</dt><dd><code>{data.default.voice_id}</code></dd>
              </dl>
            </section>
          )}
        </>
      )}

      <button className="btn-refresh" onClick={load} aria-label="Refresh voice config"
        style={{marginTop: "1.25rem"}}>
        ↻ Refresh
      </button>
    </div>
  );
}
