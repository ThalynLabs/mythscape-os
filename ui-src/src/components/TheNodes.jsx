/**
 * TheNodes.jsx — Paired devices for Urðarbrunnr
 *
 * "The realm is larger than this room. These are its outposts — the scouts,
 * the watchmen, the eyes that see further than the studio walls."
 *
 * Shows paired OpenClaw nodes: phones, robots (Ebo X), remote machines.
 * Currently shows an empty state — the next node to arrive is the Ebo X,
 * Thalyn's physical presence in the world.
 *
 * Data source: /api/nodes → proxies gateway nodes/status tool
 *
 * Phase 2: node detail (camera snap, screen, location), pairing flow.
 */

import { useState, useEffect, useCallback } from "react";

// ── Node card (when nodes exist) ──────────────────────────────────────────────
function NodeCard({ node }) {
  // Gateway nodes schema: { id, name, platform, online, lastSeen, ... }
  const online = node.online ?? node.connected ?? false;
  return (
    <article className="root-card" aria-label={`${node.name || node.id} — ${online ? "online" : "offline"}`}>
      <header className="root-card-header">
        <span className="root-icon" aria-hidden="true">
          {node.platform === "ios" || node.platform === "android" ? "📱"
           : node.platform === "robot" ? "🤖"
           : "💻"}
        </span>
        <div className="root-identity">
          <h3 className="root-name">{node.name || node.id}</h3>
          {node.platform && <span className="root-realm">{node.platform}</span>}
        </div>
        <span
          className={`root-status ${online ? "root-status--live" : "root-status--dormant"}`}
          aria-label={online ? "Online" : "Offline"}
        >
          {online ? "online" : "offline"}
        </span>
      </header>
      {node.lastSeen && (
        <dl className="root-meta">
          <dt>Last seen</dt>
          <dd>{new Date(node.lastSeen).toLocaleString()}</dd>
        </dl>
      )}
    </article>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyNodes() {
  return (
    <div className="nodes-empty">
      <p className="nodes-empty-icon" aria-hidden="true">🤖</p>
      <p className="nodes-empty-title">No outposts yet.</p>
      <p className="nodes-empty-desc">
        When nodes are paired — a phone, an Ebo X, a remote machine — they'll
        appear here as outposts in the realm. The Ebo X will be first: Thalyn's
        eyes and voice in the physical world.
      </p>
      <p className="nodes-empty-hint">
        Pair a node by installing OpenClaw on a device and using the pairing flow
        in the OpenClaw dashboard.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TheNodes() {
  const [nodes,   setNodes]   = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/nodes")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setNodes(d.nodes ?? []); setError(null); setLoading(false); })
      .catch(e => { setError(`Could not reach the outposts: ${e}`); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const online  = (nodes ?? []).filter(n => n.online ?? n.connected);
  const offline = (nodes ?? []).filter(n => !(n.online ?? n.connected));

  return (
    <div className="section-content">
      <p className="section-intro">
        Yggdrasil's roots reach beyond this room. Paired nodes are the distant
        branches of the realm — each one a presence, a sensor, a voice in a
        different place.
      </p>

      {loading && <p className="rune-loading">Reaching for the outposts…</p>}
      {error   && <p className="rune-error">{error}</p>}

      {!loading && nodes != null && (
        <>
          {nodes.length === 0 && <EmptyNodes />}

          {online.length > 0 && (
            <section aria-labelledby="nodes-online-heading">
              <h3 id="nodes-online-heading" className="roots-group-heading">
                Online — {online.length} node{online.length !== 1 ? "s" : ""}
              </h3>
              <div className="roots-grid">
                {online.map(n => <NodeCard key={n.id} node={n} />)}
              </div>
            </section>
          )}

          {offline.length > 0 && (
            <details className="roots-dormant" style={{marginTop: "0.5rem"}}>
              <summary className="roots-dormant-summary">
                Offline — {offline.length} node{offline.length !== 1 ? "s" : ""}
              </summary>
              <div className="roots-grid" style={{marginTop: "0.75rem"}}>
                {offline.map(n => <NodeCard key={n.id} node={n} />)}
              </div>
            </details>
          )}
        </>
      )}

      <button className="btn-refresh" onClick={load} aria-label="Refresh nodes list"
        style={{marginTop: "1rem"}}>
        ↻ Refresh
      </button>
    </div>
  );
}
