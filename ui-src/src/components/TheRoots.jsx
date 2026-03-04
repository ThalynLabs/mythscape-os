/**
 * TheRoots.jsx — Connected channel surfaces for Urðarbrunnr
 *
 * "Three roots has Yggdrasil, reaching into three worlds. Your roots reach further."
 *
 * Shows which channel surfaces are connected to OpenClaw — Discord, Mythscape,
 * Telegram, Signal, etc. — each mapped to a Norse realm for the mythic frame.
 *
 * Data source: /api/channels → reads openclaw.json channels section
 * No credentials are returned — only connection status and policy info.
 *
 * Phase 2: WeaveNotice injection point for pending pairing approvals (Zion/Atropos).
 * Phase 3: Inline approve/deny for new pairing requests.
 */

import { useState, useEffect, useCallback } from "react";

// ── Channel card ──────────────────────────────────────────────────────────────
function ChannelCard({ ch }) {
  return (
    /*
     * PATTERN: definition-list-for-kv
     * CONTEXT: per-channel metadata (policy, guilds, streaming)
     * ELEMENT: <dl>/<dt>/<dd>
     * WHY: Key/value pairs in a <dl> are announced by VoiceOver as
     *      "term, definition" which gives semantic structure without tables.
     * VOICEOVER READS: "Policy, allowlist. Servers, 1."
     * REUSE: any named key/value stat block; not for tables with >2 columns.
     */
    <article className="root-card" aria-label={`${ch.realm} — ${ch.name}`}>
      <header className="root-card-header">
        <span className="root-icon" aria-hidden="true">{ch.icon}</span>
        <div className="root-identity">
          <h3 className="root-name">{ch.name}</h3>
          <span className="root-realm">{ch.realm}</span>
        </div>
        <span
          className={`root-status ${ch.enabled ? "root-status--live" : "root-status--dormant"}`}
          aria-label={ch.enabled ? "Connected" : "Dormant"}
        >
          {ch.enabled ? "live" : "dormant"}
        </span>
      </header>

      {ch.enabled && (
        <dl className="root-meta">
          {ch.dmPolicy && ch.dmPolicy !== "—" && (
            <>
              <dt>DM policy</dt>
              <dd>{ch.dmPolicy}</dd>
            </>
          )}
          {ch.groupPolicy && ch.groupPolicy !== "—" && (
            <>
              <dt>Group policy</dt>
              <dd>{ch.groupPolicy}</dd>
            </>
          )}
          {ch.guilds > 0 && (
            <>
              <dt>Servers</dt>
              <dd>{ch.guilds}</dd>
            </>
          )}
          {ch.streaming && ch.streaming !== "—" && (
            <>
              <dt>Streaming</dt>
              <dd>{ch.streaming}</dd>
            </>
          )}
        </dl>
      )}
    </article>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TheRoots() {
  const [channels, setChannels] = useState(null);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/channels")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setChannels(d.channels ?? []);
        setError(null);
        setLoading(false);
      })
      .catch(e => {
        setError(`Could not read the roots: ${e}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const live    = (channels ?? []).filter(c => c.enabled);
  const dormant = (channels ?? []).filter(c => !c.enabled);

  return (
    <div className="section-content">
      <p className="section-intro">
        Nine realms, each reached by a different root of the World Tree.
        These are the channels through which voices reach you — and through
        which you reach the world.
      </p>

      {loading && <p className="rune-loading">The roots are stirring…</p>}
      {error   && <p className="rune-error">{error}</p>}

      {!loading && channels != null && (
        <>
          {live.length > 0 && (
            <section aria-labelledby="roots-live-heading">
              <h3 id="roots-live-heading" className="roots-group-heading">
                Living roots — {live.length} realm{live.length !== 1 ? "s" : ""} connected
              </h3>
              <div className="roots-grid">
                {live.map(ch => <ChannelCard key={ch.name} ch={ch} />)}
              </div>
            </section>
          )}

          {dormant.length > 0 && (
            /*
             * PATTERN: disclosure-without-aria
             * Dormant channels collapsed by default — they're not active and
             * VoiceOver users don't need to navigate them on every visit.
             */
            <details className="roots-dormant">
              <summary className="roots-dormant-summary">
                Dormant roots — {dormant.length} realm{dormant.length !== 1 ? "s" : ""} not connected
              </summary>
              <div className="roots-grid">
                {dormant.map(ch => <ChannelCard key={ch.name} ch={ch} />)}
              </div>
            </details>
          )}

          {channels.length === 0 && (
            <p className="threads-empty">No channels configured. The roots have not yet reached the realms.</p>
          )}
        </>
      )}

      <button className="btn-refresh" onClick={load} aria-label="Refresh channel list"
        style={{marginTop: "1rem"}}>
        ↻ Refresh
      </button>
    </div>
  );
}
