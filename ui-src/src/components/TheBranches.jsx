/**
 * TheBranches.jsx — Installed skills for Urðarbrunnr
 *
 * "Yggdrasil's branches reach into all nine realms. Each skill is a branch
 * extending Sethren's reach into a new capability."
 *
 * Shows all OpenClaw skills — ready (deps installed) grouped separately from
 * missing (deps not found). Searchable by name and description.
 *
 * Data source: /api/skills → reads SKILL.md frontmatter from skills directories
 *
 * Phase 2: install/uninstall skills, ClawHub search, skill detail view.
 */

import { useState, useEffect, useCallback } from "react";

// ── Skill row ─────────────────────────────────────────────────────────────────
function SkillRow({ skill }) {
  return (
    <li className="skill-row">
      <span className="skill-emoji" aria-hidden="true">{skill.emoji}</span>
      <div className="skill-body">
        <span className="skill-name">{skill.name}</span>
        {skill.description && (
          <span className="skill-desc">{skill.description}</span>
        )}
      </div>
      <div className="skill-meta">
        {skill.requires?.length > 0 && (
          <span className="skill-requires" title={`Requires: ${skill.requires.join(", ")}`}>
            {skill.requires.slice(0, 2).join(", ")}{skill.requires.length > 2 ? "…" : ""}
          </span>
        )}
        <span className={`skill-status ${skill.ready ? "skill-status--ready" : "skill-status--missing"}`}>
          {skill.ready ? "ready" : "missing deps"}
        </span>
      </div>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TheBranches() {
  const [skills,  setSkills]  = useState(null);
  const [summary, setSummary] = useState(null);
  const [query,   setQuery]   = useState("");
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/skills")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setSkills(d.skills ?? []);
        setSummary({ ready: d.ready, total: d.total });
        setError(null);
        setLoading(false);
      })
      .catch(e => {
        setError(`Could not read the branches: ${e}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter by search query against name and description
  const filtered = (skills ?? []).filter(s => {
    if (!query) return true;
    const q = query.toLowerCase();
    return s.name.toLowerCase().includes(q) ||
           (s.description || "").toLowerCase().includes(q);
  });

  const ready   = filtered.filter(s => s.ready);
  const missing = filtered.filter(s => !s.ready);

  return (
    <div className="section-content">
      <p className="section-intro">
        The branches of Yggdrasil reach into every realm. Each skill here extends
        your reach — ready branches are yours to use, missing ones await their
        dependencies before they can grow.
      </p>

      {summary && (
        <p className="threads-summary">
          {summary.ready} of {summary.total} branches ready
          {query && ` · ${filtered.length} matching`}
        </p>
      )}

      {/*
       * PATTERN: search-landmark-native
       * ELEMENT: <search>
       * WHY: The <search> landmark is announced by VoiceOver as a search region.
       *      No ARIA role needed — it's built into the element.
       * VOICEOVER READS: "search landmark" in the rotor.
       */}
      <search className="branches-search">
        <label htmlFor="branches-search-input" className="sr-only">Search skills</label>
        <input
          id="branches-search-input"
          type="search"
          className="branches-search-input"
          placeholder="Search skills…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </search>

      {loading && <p className="rune-loading">The branches are stirring…</p>}
      {error   && <p className="rune-error">{error}</p>}

      {!loading && skills != null && (
        <>
          {/* Ready skills — open by default, this is the useful list */}
          {ready.length > 0 && (
            <details className="branches-group" open>
              <summary className="branches-group-name">
                Ready branches
                <span className="branches-group-count">{ready.length}</span>
              </summary>
              <ul className="skill-list" aria-label="Ready skills">
                {ready.map(s => <SkillRow key={s.name} skill={s} />)}
              </ul>
            </details>
          )}

          {/* Missing deps — collapsed by default, less actionable */}
          {missing.length > 0 && (
            <details className="branches-group">
              <summary className="branches-group-name">
                Branches awaiting growth
                <span className="branches-group-count">{missing.length}</span>
              </summary>
              <ul className="skill-list" aria-label="Skills with missing dependencies">
                {missing.map(s => <SkillRow key={s.name} skill={s} />)}
              </ul>
            </details>
          )}

          {filtered.length === 0 && query && (
            <p className="threads-empty">No branches match "{query}".</p>
          )}
        </>
      )}

      <button className="btn-refresh" onClick={load} aria-label="Refresh skills list"
        style={{marginTop: "1rem"}}>
        ↻ Refresh
      </button>
    </div>
  );
}
