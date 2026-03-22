/**
 * TheNorns.jsx — Brain Admin Panel
 *
 * Three Norns tend the World Tree at the Well of Urd:
 *   - Urd ("what has passed"): episodic memory & anchor browser — search, view, delete
 *   - Verdandi ("what is now"): active thread, brain state, blackboard, emotion
 *   - Skuld ("what is yet to be"): consolidation queue, pending anchor candidates
 *
 * Data source: Brain API at 127.0.0.1:3008, proxied through daemon at /api/brain/*
 * Brain holds episodic memory, anchors, emotion state, thread continuity, and consolidation.
 */

import { Fragment, useState, useEffect, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

// Valerie's user UUID — used for Brain API queries that require a user_id.
// This is the stable identity UUID from the Brain's user table, not a display name.
const VALERIE_UUID = "f94d5e6d-d7a7-4e6f-a15d-37d30a9592fc";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtRelative(ts) {
  if (!ts) return "\u2014";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function truncate(str, len = 200) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
}

function formatUptime(s) {
  if (!s && s !== 0) return "\u2014";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CATEGORY_LABELS = {
  decisions: "Decisions",
  preferences: "Preferences",
  relationships: "Relationships",
  workspace: "Workspace",
  identity: "Identity",
  pinned: "Pinned",
};

const DECAY_LABELS = {
  core: "Core (never fades)",
  stable: "Stable",
  recent: "Recent",
  ephemeral: "Ephemeral",
};

// ── Brain API fetch helper ───────────────────────────────────────────────────

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

// ── Urd: What Has Passed ────────────────────────────────────────────────────
// Episodic memory & anchor browser with semantic search

const STATUS_COLORS = {
  active: "var(--well-water)",
  permanent: "var(--well-moss)",
  superseded: "var(--text-muted)",
};

const CHAIN_STEPS = ["assumption", "failure", "revision", "outcome"];
const CHAIN_STEP_LABELS = { assumption: "Assumption", failure: "Failure", revision: "Revision", outcome: "Outcome" };

const EMPTY_CHAIN_FORM = { assumption: "", failure: "", revision: "", outcome: "", tags: "", confidence: 0.7 };

function Urd() {
  const [view, setView] = useState("overview"); // overview | search | detail
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [inspectData, setInspectData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Reasoning chains state
  const [chains, setChains] = useState([]);
  const [chainsLoading, setChainsLoading] = useState(false);
  const [chainsQuery, setChainsQuery] = useState("");
  const [chainsFilter, setChainsFilter] = useState({ status: "", minConf: 0, maxConf: 1, tag: "" });
  const [showChainForm, setShowChainForm] = useState(false);
  const [chainForm, setChainForm] = useState(EMPTY_CHAIN_FORM);
  const [chainSaving, setChainSaving] = useState(false);
  const [chainActing, setChainActing] = useState(null);

  // Load overview stats
  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await brainFetch("/admin/debug");
      setDebugData(data);
    } catch (e) {
      setError(`Could not load memory stats: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  // Semantic search
  const doSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const data = await brainFetch("/search", {
        method: "POST",
        body: {
          who: { user_id: VALERIE_UUID, agent_id: "sethren" },
          query: searchQuery,
          limit: 30,
          include: "both",
        },
      });
      setSearchResults(data);
      setView("search");
    } catch (e) {
      setError(`Search failed: ${e.message}`);
    }
    setSearching(false);
  }, [searchQuery]);

  // Load agent inspect data (memories + anchors)
  const loadInspect = useCallback(async (agentId = "sethren") => {
    setInspectLoading(true);
    try {
      const data = await brainFetch("/admin/inspect", {
        params: { agent_id: agentId, user_id: VALERIE_UUID },
      });
      setInspectData(data);
    } catch (e) {
      setError(`Inspect failed: ${e.message}`);
    }
    setInspectLoading(false);
  }, []);

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") doSearch();
  };

  // Reasoning chains
  const loadChains = useCallback(async (query = "") => {
    setChainsLoading(true);
    try {
      const data = await brainFetch("/reasoning-chains/search", {
        params: { q: query, agent_id: "sethren", limit: "30" },
      });
      setChains(data.chains || data.results || data || []);
    } catch (e) {
      setError(`Reasoning chains: ${e.message}`);
    }
    setChainsLoading(false);
  }, []);

  useEffect(() => { loadChains(); }, [loadChains]);

  const filteredChains = chains.filter(c => {
    if (chainsFilter.status && c.status !== chainsFilter.status) return false;
    const conf = c.confidence ?? 0;
    if (conf < chainsFilter.minConf || conf > chainsFilter.maxConf) return false;
    if (chainsFilter.tag) {
      const tags = c.tags || [];
      if (!tags.some(t => t.toLowerCase().includes(chainsFilter.tag.toLowerCase()))) return false;
    }
    return true;
  });

  const handleChainAction = async (chainId, patch) => {
    setChainActing(chainId);
    try {
      await brainFetch(`/reasoning-chains/${chainId}`, { method: "PATCH", body: patch });
      await loadChains(chainsQuery);
    } catch (e) {
      setError(`Chain action failed: ${e.message}`);
    }
    setChainActing(null);
  };

  const handleCreateChain = async () => {
    setChainSaving(true);
    try {
      const tags = chainForm.tags ? chainForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
      await brainFetch("/reasoning-chains", {
        method: "POST",
        body: {
          agent_id: "sethren",
          assumption: chainForm.assumption,
          failure: chainForm.failure,
          revision: chainForm.revision,
          outcome: chainForm.outcome,
          tags,
          confidence: Number(chainForm.confidence),
        },
      });
      setChainForm(EMPTY_CHAIN_FORM);
      setShowChainForm(false);
      await loadChains(chainsQuery);
    } catch (e) {
      setError(`Create chain failed: ${e.message}`);
    }
    setChainSaving(false);
  };

  const memStats = debugData?.memories;

  return (
    <details className="norn-pane" open>
      <summary className="norn-heading">
        <span className="norn-name">Urd</span>
        <span className="norn-role">What has passed &middot; Episodic Memory</span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Urd holds the record of what was spoken and learned at the Well.
          Episodic memories, relationship anchors, and the long thread of past sessions.
        </p>

        {error && <p className="rune-error">{error}</p>}

        {/* Search bar */}
        <section aria-label="Memory search">
          <h3>Search memory</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Search memories and anchors..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="norns-input"
              style={{ flex: 1 }}
            />
            <button className="btn-refresh" onClick={doSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? "Searching\u2026" : "Search"}
            </button>
          </div>
        </section>

        {/* Search results */}
        {view === "search" && searchResults && (
          <section aria-label="Search results">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3>Results ({searchResults.count || 0})</h3>
              <button className="btn-refresh" onClick={() => { setView("overview"); setSearchResults(null); }}>
                Back to overview
              </button>
            </div>
            {searchResults.results?.length > 0 ? (
              <ul className="norns-result-list">
                {searchResults.results.map((r, i) => (
                  <li key={r.id || i} className="norns-result-item" onClick={() => setSelectedItem(r)}>
                    <div className="norns-result-header">
                      <span className={`norns-badge norns-badge-${r.type}`}>{r.type}</span>
                      {r.category && <span className="norns-badge norns-badge-cat">{r.category}</span>}
                      {r.decay_class && <span className="norns-badge norns-badge-decay">{r.decay_class}</span>}
                      <span className="norns-score">{(r.score * 100).toFixed(0)}%</span>
                    </div>
                    <p className="norns-result-text">{truncate(r.content, 300)}</p>
                    {r.subject && <span className="norns-result-meta">Subject: {r.subject}</span>}
                    <span className="norns-result-meta">{fmtDate(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="coming-soon-inline">No results for "{searchQuery}"</p>
            )}
          </section>
        )}

        {/* Selected item detail */}
        {selectedItem && (
          <section aria-label="Memory detail" className="norns-detail-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Detail</h3>
              <button className="btn-refresh" onClick={() => setSelectedItem(null)}>Close</button>
            </div>
            <dl className="stat-grid">
              <dt>Type</dt><dd>{selectedItem.type}</dd>
              <dt>ID</dt><dd style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{selectedItem.id}</dd>
              {selectedItem.category && <><dt>Category</dt><dd>{CATEGORY_LABELS[selectedItem.category] || selectedItem.category}</dd></>}
              {selectedItem.decay_class && <><dt>Decay class</dt><dd>{DECAY_LABELS[selectedItem.decay_class] || selectedItem.decay_class}</dd></>}
              {selectedItem.memory_origin && <><dt>Origin</dt><dd>{selectedItem.memory_origin}</dd></>}
              {selectedItem.significance && <><dt>Significance</dt><dd>{selectedItem.significance}</dd></>}
              {selectedItem.subject && <><dt>Subject</dt><dd>{selectedItem.subject}</dd></>}
              <dt>Created</dt><dd>{fmtDate(selectedItem.created_at)}</dd>
              {selectedItem.score != null && <><dt>Relevance</dt><dd>{(selectedItem.score * 100).toFixed(1)}%</dd></>}
            </dl>
            <pre className="norns-content-block">{selectedItem.content}</pre>
          </section>
        )}

        {/* Overview stats */}
        {view === "overview" && (
          <>
            {loading && <p className="rune-loading">Reading the threads of memory...</p>}

            {memStats && (
              <section aria-label="Memory statistics">
                <h3>Memory overview</h3>
                <dl className="stat-grid">
                  {memStats.totals?.map((row, i) => (
                    <Fragment key={row.type || i}>
                      <dt>{row.type === "memory" ? "Episodic memories" : row.type === "anchor" ? "Anchors" : row.type || "Total"}</dt>
                      <dd>{row.count?.toLocaleString()}</dd>
                    </Fragment>
                  ))}
                </dl>

                {/* By origin breakdown */}
                {memStats.by_origin?.length > 0 && (
                  <details className="norns-sub-detail">
                    <summary>By origin</summary>
                    <dl className="stat-grid" style={{ marginTop: "0.5rem" }}>
                      {memStats.by_origin.map(row => (
                        <Fragment key={row.memory_origin}>
                          <dt>{row.memory_origin}</dt>
                          <dd>{row.count?.toLocaleString()}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </details>
                )}

                {/* By decay class */}
                {memStats.by_decay?.length > 0 && (
                  <details className="norns-sub-detail">
                    <summary>By decay class</summary>
                    <dl className="stat-grid" style={{ marginTop: "0.5rem" }}>
                      {memStats.by_decay.map(row => (
                        <Fragment key={row.decay_class}>
                          <dt>{DECAY_LABELS[row.decay_class] || row.decay_class}</dt>
                          <dd>{row.count?.toLocaleString()}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </details>
                )}

                {/* Salience stats */}
                {memStats.salience_stats && (
                  <details className="norns-sub-detail">
                    <summary>Salience distribution</summary>
                    <dl className="stat-grid" style={{ marginTop: "0.5rem" }}>
                      <dt>Average</dt><dd>{Number(memStats.salience_stats.avg_salience).toFixed(3)}</dd>
                      <dt>Min</dt><dd>{Number(memStats.salience_stats.min_salience).toFixed(3)}</dd>
                      <dt>Max</dt><dd>{Number(memStats.salience_stats.max_salience).toFixed(3)}</dd>
                    </dl>
                  </details>
                )}
              </section>
            )}

            {/* Inspect agent memories */}
            <section aria-label="Agent inspection">
              <h3>Inspect agent</h3>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button className="btn-refresh" onClick={() => loadInspect("sethren")} disabled={inspectLoading}>
                  {inspectLoading ? "Loading\u2026" : "Inspect Sethren"}
                </button>
              </div>

              {inspectData && (
                <div style={{ marginTop: "0.75rem" }}>
                  <dl className="stat-grid">
                    <dt>Agent</dt><dd>{inspectData.agent_id}</dd>
                    <dt>Min salience</dt><dd>{inspectData.em_min_salience}</dd>
                    <dt>Memories</dt><dd>{inspectData.memories?.count?.toLocaleString() ?? "\u2014"}</dd>
                    <dt>Anchors</dt><dd>{inspectData.anchors?.length?.toLocaleString() ?? "\u2014"}</dd>
                  </dl>

                  {/* Anchor list */}
                  {inspectData.anchors?.length > 0 && (
                    <details className="norns-sub-detail">
                      <summary>Anchors ({inspectData.anchors.length})</summary>
                      <ul className="norns-result-list" style={{ marginTop: "0.5rem" }}>
                        {inspectData.anchors.map((a, i) => (
                          <li key={a.id || i} className="norns-result-item">
                            <div className="norns-result-header">
                              <span className="norns-badge norns-badge-cat">{a.category}</span>
                              {a.subject && <span className="norns-badge norns-badge-decay">{a.subject}</span>}
                            </div>
                            <p className="norns-result-text">{a.gist}</p>
                            {a.significance && <span className="norns-result-meta">{a.significance}</span>}
                            <span className="norns-result-meta">{fmtDate(a.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* Spine seed */}
                  {inspectData.spine && (
                    <details className="norns-sub-detail">
                      <summary>Narrative spine</summary>
                      <pre className="norns-content-block" style={{ marginTop: "0.5rem" }}>
                        {JSON.stringify(inspectData.spine, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </section>

            <button className="btn-refresh" onClick={loadOverview} style={{ marginTop: "0.5rem" }}>
              Refresh
            </button>
          </>
        )}

        {/* Reasoning Chains */}
        <section aria-label="Reasoning chains" className="norns-reasoning-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Reasoning Chains</h3>
            <button className="btn-refresh" onClick={() => setShowChainForm(f => !f)}>
              {showChainForm ? "Cancel" : "Add Reasoning Chain"}
            </button>
          </div>

          {/* Create form */}
          {showChainForm && (
            <div className="norns-chain-form">
              {CHAIN_STEPS.map(step => (
                <label key={step} className="norns-chain-form-field">
                  <span>{CHAIN_STEP_LABELS[step]}</span>
                  <textarea
                    rows={2}
                    className="norns-input"
                    value={chainForm[step]}
                    onChange={e => setChainForm(f => ({ ...f, [step]: e.target.value }))}
                    placeholder={CHAIN_STEP_LABELS[step]}
                  />
                </label>
              ))}
              <label className="norns-chain-form-field">
                <span>Tags (comma-separated)</span>
                <input
                  type="text"
                  className="norns-input"
                  value={chainForm.tags}
                  onChange={e => setChainForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g. prompting, memory, context"
                />
              </label>
              <label className="norns-chain-form-field">
                <span>Confidence: {Number(chainForm.confidence).toFixed(2)}</span>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={chainForm.confidence}
                  onChange={e => setChainForm(f => ({ ...f, confidence: e.target.value }))}
                />
              </label>
              <button
                className="btn-refresh norns-btn-approve"
                onClick={handleCreateChain}
                disabled={chainSaving || !chainForm.assumption.trim()}
              >
                {chainSaving ? "Saving..." : "Create Chain"}
              </button>
            </div>
          )}

          {/* Filters */}
          <div className="norns-chain-filters">
            <input
              type="text"
              className="norns-input"
              placeholder="Search chains..."
              value={chainsQuery}
              onChange={e => setChainsQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") loadChains(chainsQuery); }}
              style={{ flex: 1 }}
            />
            <select
              className="norns-input"
              value={chainsFilter.status}
              onChange={e => setChainsFilter(f => ({ ...f, status: e.target.value }))}
              style={{ width: "auto" }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="permanent">Permanent</option>
              <option value="superseded">Superseded</option>
            </select>
            <input
              type="text"
              className="norns-input"
              placeholder="Filter tag..."
              value={chainsFilter.tag}
              onChange={e => setChainsFilter(f => ({ ...f, tag: e.target.value }))}
              style={{ width: "8rem" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Conf: {chainsFilter.minConf.toFixed(1)}&ndash;{chainsFilter.maxConf.toFixed(1)}
              <input type="range" min="0" max="1" step="0.1"
                value={chainsFilter.minConf}
                onChange={e => setChainsFilter(f => ({ ...f, minConf: Number(e.target.value) }))}
                style={{ width: "4rem" }}
              />
              <input type="range" min="0" max="1" step="0.1"
                value={chainsFilter.maxConf}
                onChange={e => setChainsFilter(f => ({ ...f, maxConf: Number(e.target.value) }))}
                style={{ width: "4rem" }}
              />
            </label>
            <button className="btn-refresh" onClick={() => loadChains(chainsQuery)}>
              {chainsLoading ? "Loading..." : "Search"}
            </button>
          </div>

          {/* Chain cards */}
          {chainsLoading && !chains.length && <p className="rune-loading">Loading reasoning chains...</p>}
          {filteredChains.length > 0 ? (
            <ul className="norns-result-list">
              {filteredChains.map(c => (
                <li key={c.id} className="norns-result-item norns-chain-card">
                  <div className="norns-result-header">
                    <span className="norns-badge" style={{ color: STATUS_COLORS[c.status] || "var(--text-muted)", borderColor: STATUS_COLORS[c.status] || "var(--text-muted)" }}>
                      {c.status || "active"}
                    </span>
                    <span className="norns-score">conf: {((c.confidence ?? 0) * 100).toFixed(0)}%</span>
                    <span className="norns-result-meta">{fmtDate(c.created_at)}</span>
                  </div>

                  {/* Flow steps */}
                  <div className="norns-chain-flow">
                    {CHAIN_STEPS.map((step, i) => (
                      <Fragment key={step}>
                        <div className={`norns-chain-step norns-chain-step-${step}`}>
                          <span className="norns-chain-step-label">{CHAIN_STEP_LABELS[step]}</span>
                          <p>{c[step] || "\u2014"}</p>
                        </div>
                        {i < CHAIN_STEPS.length - 1 && <span className="norns-chain-arrow" aria-hidden="true">&darr;</span>}
                      </Fragment>
                    ))}
                  </div>

                  {/* Tags */}
                  {c.tags?.length > 0 && (
                    <div className="norns-tags">
                      {c.tags.map(t => <span key={t} className="norns-tag">{t}</span>)}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="norns-candidate-actions">
                    {c.status !== "permanent" && (
                      <button className="btn-refresh norns-btn-approve" onClick={() => handleChainAction(c.id, { status: "permanent" })} disabled={chainActing === c.id}>
                        Promote
                      </button>
                    )}
                    {c.status !== "superseded" && (
                      <button className="btn-refresh norns-btn-reject" onClick={() => handleChainAction(c.id, { status: "superseded" })} disabled={chainActing === c.id}>
                        Prune
                      </button>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
                      Conf:
                      <input type="range" min="0" max="1" step="0.05"
                        value={c.confidence ?? 0.5}
                        onChange={e => handleChainAction(c.id, { confidence: Number(e.target.value) })}
                        disabled={chainActing === c.id}
                        style={{ width: "5rem" }}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !chainsLoading && <p className="coming-soon-inline">No reasoning chains found.</p>
          )}
        </section>
      </div>
    </details>
  );
}

// ── Verdandi: What Is Now ───────────────────────────────────────────────────
// Active thread state, brain state, blackboard, emotion

function Verdandi({ health, agents }) {
  const [brainHealth, setBrainHealth] = useState(null);
  const [thread, setThread] = useState(null);
  const [brainState, setBrainState] = useState(null);
  const [blackboard, setBlackboard] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      brainFetch("/health"),
      brainFetch("/thread/sethren", { params: { user_id: VALERIE_UUID } }),
      brainFetch("/brain-state/sethren", { params: { user_id: VALERIE_UUID } }),
      brainFetch("/blackboard/sethren"),
      brainFetch("/emotion/sethren"),
    ]);

    if (results[0].status === "fulfilled") setBrainHealth(results[0].value);
    if (results[1].status === "fulfilled") setThread(results[1].value);
    if (results[2].status === "fulfilled") setBrainState(results[2].value);
    if (results[3].status === "fulfilled") setBlackboard(results[3].value);
    if (results[4].status === "fulfilled") setEmotion(results[4].value);

    const failures = results.filter(r => r.status === "rejected");
    if (failures.length === results.length) {
      setError("Brain is unreachable");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(loadAll, 30_000);
    return () => clearInterval(t);
  }, [loadAll]);

  const gatewayStatus = health?.status ?? "connecting";
  const isHealthy = gatewayStatus === "healthy";
  const brainOk = brainHealth?.ok === true;

  const emotionState = emotion?.state;
  // Map arousal/valence to a human-readable mood
  function moodLabel(state) {
    if (!state) return "\u2014";
    const { valence, arousal } = state;
    if (valence > 0.6 && arousal > 0.6) return "Energized, positive";
    if (valence > 0.6 && arousal <= 0.6) return "Calm, content";
    if (valence <= 0.4 && arousal > 0.6) return "Tense, alert";
    if (valence <= 0.4 && arousal <= 0.4) return "Low energy, subdued";
    return "Neutral";
  }

  return (
    <details className="norn-pane" open>
      <summary className="norn-heading">
        <span className="norn-name">Verdandi</span>
        <span className="norn-role">What is now &middot; Active state</span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Verdandi holds the thread being spun right now &mdash; the running brain,
          the active conversation, and the living state of memory.
        </p>

        {error && <p className="rune-error">{error}</p>}
        {loading && <p className="rune-loading">Sensing the present moment...</p>}

        {/* Brain health */}
        <section aria-label="Brain status">
          <h3>Brain</h3>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.5rem" }}>
            <output className={`gateway-badge ${brainOk ? "ok" : "error"}`}>
              <span className="dot" aria-hidden="true" />
              {brainOk ? "The Brain is awake" : "The Brain sleeps"}
            </output>
          </div>
          <dl className="stat-grid">
            <dt>Gateway</dt>
            <dd>
              <output className={isHealthy ? "ok" : "error"}>
                {isHealthy ? "Healthy" : gatewayStatus}
              </output>
            </dd>
            <dt>Brain uptime</dt>
            <dd>{formatUptime(brainHealth?.uptime_seconds)}</dd>
            <dt>Database</dt>
            <dd>{brainHealth?.db?.connected ? "Connected" : "Disconnected"}</dd>
          </dl>
        </section>

        {/* Brain state (awake/drowsy/dreaming) */}
        {brainState && (
          <section aria-label="Brain state">
            <h3>Consciousness</h3>
            <dl className="stat-grid">
              <dt>State</dt>
              <dd>
                <span className={`norns-brain-state norns-brain-state-${brainState.state}`}>
                  {brainState.state === "awake" ? "Awake" :
                   brainState.state === "drowsy" ? "Drowsy" :
                   brainState.state === "dreaming" ? "Dreaming" : brainState.state}
                </span>
              </dd>
              {brainState.updated_at && (
                <><dt>Since</dt><dd>{fmtRelative(brainState.updated_at)}</dd></>
              )}
            </dl>
          </section>
        )}

        {/* Emotion state */}
        {emotionState && (
          <section aria-label="Emotion state">
            <h3>Emotional register</h3>
            <dl className="stat-grid">
              <dt>Mood</dt><dd>{moodLabel(emotionState)}</dd>
              <dt>Arousal</dt>
              <dd>
                <div className="norns-bar-wrap">
                  <div className="norns-bar" style={{ width: `${(emotionState.arousal * 100).toFixed(0)}%` }} />
                  <span>{(emotionState.arousal * 100).toFixed(0)}%</span>
                </div>
              </dd>
              <dt>Valence</dt>
              <dd>
                <div className="norns-bar-wrap">
                  <div className="norns-bar norns-bar-valence" style={{ width: `${(emotionState.valence * 100).toFixed(0)}%` }} />
                  <span>{(emotionState.valence * 100).toFixed(0)}%</span>
                </div>
              </dd>
              <dt>Openness</dt>
              <dd>
                <div className="norns-bar-wrap">
                  <div className="norns-bar norns-bar-openness" style={{ width: `${(emotionState.openness * 100).toFixed(0)}%` }} />
                  <span>{(emotionState.openness * 100).toFixed(0)}%</span>
                </div>
              </dd>
              <dt>Warmth</dt>
              <dd>
                <div className="norns-bar-wrap">
                  <div className="norns-bar norns-bar-warmth" style={{ width: `${(emotionState.warmth * 100).toFixed(0)}%` }} />
                  <span>{(emotionState.warmth * 100).toFixed(0)}%</span>
                </div>
              </dd>
            </dl>
          </section>
        )}

        {/* Active thread */}
        <section aria-label="Active thread">
          <h3>Active thread</h3>
          {thread?.active_thread ? (
            <dl className="stat-grid">
              <dt>Surface</dt><dd>{thread.active_thread.surface}</dd>
              {thread.active_thread.topic && <><dt>Topic</dt><dd>{thread.active_thread.topic}</dd></>}
              {thread.active_thread.context_summary && (
                <><dt>Context</dt><dd>{truncate(thread.active_thread.context_summary, 150)}</dd></>
              )}
              <dt>Last activity</dt><dd>{fmtRelative(thread.active_thread.last_activity)}</dd>
              <dt>Conversation</dt>
              <dd style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                {thread.active_thread.conversation_id || "\u2014"}
              </dd>
            </dl>
          ) : (
            <p className="coming-soon-inline">No active thread</p>
          )}
        </section>

        {/* Blackboard */}
        {blackboard && (
          <section aria-label="Blackboard">
            <h3>Blackboard ({blackboard.count || 0} entries)</h3>
            {blackboard.entries?.length > 0 ? (
              <ul className="norns-result-list">
                {blackboard.entries.slice(0, 10).map((entry, i) => (
                  <li key={entry.id || i} className="norns-result-item norns-bb-item">
                    <div className="norns-result-header">
                      {entry.source_channel && <span className="norns-badge norns-badge-cat">{entry.source_channel}</span>}
                      {entry.salience != null && <span className="norns-score">sal: {(entry.salience * 100).toFixed(0)}%</span>}
                    </div>
                    <p className="norns-result-text">{truncate(entry.content, 200)}</p>
                    {entry.tags?.length > 0 && (
                      <div className="norns-tags">
                        {entry.tags.map(t => <span key={t} className="norns-tag">{t}</span>)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="coming-soon-inline">Blackboard is empty</p>
            )}
          </section>
        )}

        {/* Agents */}
        <section aria-label="Active agents">
          <h3>Agents</h3>
          <ul className="agent-list">
            {agents.map(a => (
              <li key={a.agentId} className="agent-item">
                <span className="agent-name">{a.displayName}</span>
                <span className="agent-id muted">({a.agentId})</span>
              </li>
            ))}
          </ul>
        </section>

        <button className="btn-refresh" onClick={loadAll} style={{ marginTop: "0.5rem" }}>
          Refresh
        </button>
      </div>
    </details>
  );
}

// ── Skuld: What Is Yet To Be ────────────────────────────────────────────────
// Consolidation queue, pending anchor candidates, cron schedule

function Skuld({ health }) {
  const [candidates, setCandidates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await brainFetch("/anchor-candidates", {
        params: { status: "pending", limit: "50" },
      });
      setCandidates(data);
    } catch (e) {
      setError(`Could not load candidates: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const reviewCandidate = async (id, status) => {
    setReviewingId(id);
    try {
      await brainFetch(`/anchor-candidates/${id}`, {
        method: "PATCH",
        body: { status, reviewed_by: "valerie-well-ui" },
      });
      // Reload
      await loadCandidates();
    } catch (e) {
      setError(`Review failed: ${e.message}`);
    }
    setReviewingId(null);
  };

  const wakeActive = health?.wake_word?.active ?? false;
  const wakeDetections = health?.wake_word?.detections_last_hour ?? 0;

  const pendingCount = candidates?.count ?? 0;

  return (
    <details className="norn-pane">
      <summary className="norn-heading">
        <span className="norn-name">Skuld</span>
        <span className="norn-role">
          What is yet to be &middot; Consolidation
          {pendingCount > 0 && <span className="norns-pending-count">{pendingCount}</span>}
        </span>
      </summary>

      <div className="norn-body">
        <p className="norn-desc">
          Skuld holds the obligations not yet fulfilled &mdash; anchor candidates awaiting review,
          consolidation runs, and the rhythm of the agent's future work.
        </p>

        {error && <p className="rune-error">{error}</p>}

        {/* Pending anchor candidates */}
        <section aria-label="Anchor candidates">
          <h3>Pending anchor candidates ({pendingCount})</h3>
          {loading && <p className="rune-loading">Reading the future threads...</p>}

          {candidates?.candidates?.length > 0 ? (
            <ul className="norns-result-list">
              {candidates.candidates.map(c => (
                <li key={c.id} className="norns-result-item norns-candidate">
                  <div className="norns-result-header">
                    <span className="norns-badge norns-badge-cat">{c.category}</span>
                    {c.anchor_type && <span className="norns-badge norns-badge-decay">{c.anchor_type}</span>}
                    <span className="norns-score">conf: {(c.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="norns-result-text"><strong>{c.slot_key}:</strong> {c.gist}</p>
                  {c.significance && <p className="norns-result-meta">{c.significance}</p>}
                  {c.would_replace_reason && (
                    <p className="norns-result-meta norns-replace-note">
                      Would replace: {c.would_replace_reason}
                    </p>
                  )}
                  <div className="norns-result-meta">
                    <span>Pass: {c.consolidation_pass}</span>
                    {c.subject && <span> &middot; Subject: {c.subject}</span>}
                    <span> &middot; {fmtRelative(c.created_at)}</span>
                  </div>
                  <div className="norns-candidate-actions">
                    <button
                      className="btn-refresh norns-btn-approve"
                      onClick={() => reviewCandidate(c.id, "approved")}
                      disabled={reviewingId === c.id}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-refresh norns-btn-reject"
                      onClick={() => reviewCandidate(c.id, "rejected")}
                      disabled={reviewingId === c.id}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !loading && <p className="coming-soon-inline">No pending candidates. The consolidation queue is clear.</p>
          )}
        </section>

        {/* Wake word state */}
        <section aria-label="Wake word">
          <h3>Wake word</h3>
          <dl className="stat-grid">
            <dt>Status</dt>
            <dd>
              <output className={wakeActive ? "ok" : "muted"}>
                {wakeActive ? "Listening" : "Inactive"}
              </output>
            </dd>
            <dt>Detections (last hour)</dt>
            <dd>{wakeDetections}</dd>
          </dl>
        </section>

        {/* Cron placeholder */}
        <section aria-label="Scheduled tasks">
          <h3>Scheduled tasks</h3>
          <p className="coming-soon-inline">
            Full cron list coming once the gateway cron endpoint is wired.
          </p>
        </section>

        <button className="btn-refresh" onClick={loadCandidates} style={{ marginTop: "0.5rem" }}>
          Refresh
        </button>
      </div>
    </details>
  );
}

// ── TheNorns (root component) ───────────────────────────────────────────────

export default function TheNorns({ health, agents }) {
  return (
    <div className="section-content norns-section">
      <p className="section-desc">
        Three sisters tend the World Tree. Each holds a different strand of time.
      </p>

      <Urd />
      <Verdandi health={health} agents={agents} />
      <Skuld health={health} />
    </div>
  );
}
