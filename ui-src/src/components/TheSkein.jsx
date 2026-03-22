/**
 * TheSkein.jsx — Conversation archive browser
 *
 * "The Skein is the woven record — every thread that has passed through the Well."
 *
 * Two views:
 *   1. Session List — messages grouped by session boundaries, paginated
 *   2. Conversation Reader — parsed message view with per-speaker styling
 *
 * Data source: GET /api/skein (list) and GET /api/skein/:id (single entry)
 *
 * Session grouping: hybrid approach — session_boundary entries act as hard splits,
 * and time gaps >= 60 minutes also split sessions within each boundary chunk.
 */

import { useState, useEffect, useCallback, useMemo } from "react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function truncate(str, len = 100) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

const SURFACE_ICON = {
  discord: "🔷", telegram: "✈️", signal: "🔒", openclaw: "🌳", default: "💬",
};

const PAGE_SIZES = [20, 50, 100];

/** Stable color for a speaker name */
function speakerColor(name) {
  const colors = [
    "var(--skein-speaker-1, #7eb8da)",
    "var(--skein-speaker-2, #c49bdb)",
    "var(--skein-speaker-3, #8bc99a)",
    "var(--skein-speaker-4, #dba86e)",
    "var(--skein-speaker-5, #db7b7b)",
    "var(--skein-speaker-6, #6ec4c4)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

/** Split a chronologically-sorted array of messages on time gaps >= gapMs */
function splitOnTimeGaps(msgs, gapMs) {
  if (msgs.length === 0) return [];
  const groups = [[msgs[0]]];
  for (let i = 1; i < msgs.length; i++) {
    const prev = new Date(msgs[i - 1].timestamp).getTime();
    const curr = new Date(msgs[i].timestamp).getTime();
    if (curr - prev >= gapMs) {
      groups.push([msgs[i]]);
    } else {
      groups[groups.length - 1].push(msgs[i]);
    }
  }
  return groups;
}

const TIME_GAP_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Group message entries into sessions using a hybrid approach:
 * 1. session_boundary entries act as hard splits
 * 2. Within each boundary-delimited chunk, further split on time gaps >= 60 min
 */
function groupIntoSessions(messages, boundaries) {
  // Sort boundaries chronologically (oldest first)
  const sortedBounds = [...boundaries].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  // Sort messages chronologically (oldest first)
  const sortedMsgs = [...messages].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const boundaryTimes = sortedBounds.map(b => new Date(b.timestamp).getTime());
  const boundaryChunks = [];

  // Split messages into chunks by boundary first
  // Session 0: messages with timestamp <= boundary[0]
  // Session 1: messages with boundary[0] < timestamp <= boundary[1]
  // Session N: messages with timestamp > boundary[N-1]
  for (const msg of sortedMsgs) {
    const msgTime = new Date(msg.timestamp).getTime();
    let chunkIdx = boundaryTimes.length;
    for (let i = 0; i < boundaryTimes.length; i++) {
      if (msgTime <= boundaryTimes[i]) {
        chunkIdx = i;
        break;
      }
    }
    if (!boundaryChunks[chunkIdx]) {
      boundaryChunks[chunkIdx] = [];
    }
    boundaryChunks[chunkIdx].push(msg);
  }

  // Sub-split each boundary chunk on time gaps, then build session objects
  const result = [];
  let sessionCounter = 0;
  const totalSlots = boundaryTimes.length + 1;

  for (let i = 0; i < totalSlots; i++) {
    const chunk = boundaryChunks[i];
    if (!chunk || chunk.length === 0) continue;

    // Ensure chunk is sorted by timestamp before gap-splitting
    chunk.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const subGroups = splitOnTimeGaps(chunk, TIME_GAP_MS);
    const isLastChunk = i === boundaryTimes.length;

    for (let g = 0; g < subGroups.length; g++) {
      const entries = subGroups[g];

      const participantSet = new Set();
      let surface = null;
      for (const e of entries) {
        if (e.participants) e.participants.forEach(p => participantSet.add(p));
        if (e.surface && !surface) surface = e.surface;
      }

      const firstEntry = entries[0];
      const lastEntry = entries[entries.length - 1];
      const preview = truncate(firstEntry.summary || firstEntry.content, 100);

      result.push({
        id: `session-${sessionCounter++}`,
        firstTimestamp: firstEntry.timestamp,
        lastTimestamp: lastEntry.timestamp,
        participants: [...participantSet],
        surface: surface,
        messageCount: entries.length,
        preview: preview,
        entries: entries,
        isCurrent: isLastChunk && g === subGroups.length - 1,
      });
    }
  }

  // Return newest sessions first
  return result.reverse();
}

function normalizeSession(session) {
  const preferredEntries = session.entries.some(
    e => Array.isArray(e.tags) && e.tags.includes("historical-import")
  )
    ? session.entries.filter(
        e => Array.isArray(e.tags) && e.tags.includes("historical-import")
      )
    : session.entries;

  if (preferredEntries.length === session.entries.length) return session;

  const entries = [...preferredEntries].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  const participantSet = new Set();
  let surface = null;
  for (const e of entries) {
    if (e.participants) e.participants.forEach(p => participantSet.add(p));
    if (e.surface && !surface) surface = e.surface;
  }

  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const preview = truncate(firstEntry.summary || firstEntry.content, 100);

  return {
    ...session,
    firstTimestamp: firstEntry.timestamp,
    lastTimestamp: lastEntry.timestamp,
    participants: [...participantSet],
    surface,
    messageCount: entries.length,
    preview,
    entries,
  };
}

// ── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <nav className="skein-pagination" aria-label="Pagination" style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      gap: "0.35rem", marginTop: "0.75rem", flexWrap: "wrap",
    }}>
      <button className="btn-refresh" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        ← Prev
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ padding: "0 0.25rem" }}>…</span>
        ) : (
          <button
            key={p}
            className="btn-refresh"
            onClick={() => onPageChange(p)}
            disabled={p === page}
            aria-current={p === page ? "page" : undefined}
            style={p === page ? { fontWeight: "bold", textDecoration: "underline" } : {}}
          >
            {p}
          </button>
        )
      )}
      <button className="btn-refresh" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next →
      </button>
    </nav>
  );
}

// ── Page size dropdown ───────────────────────────────────────────────────────

function PageSizeSelect({ value, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
      {label || "Per page:"}
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="rune-input"
        style={{ width: "auto", padding: "0.15rem 0.3rem" }}
      >
        {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}

// ── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ filters, onChange }) {
  const update = (key, val) => onChange({ ...filters, [key]: val });
  return (
    <div className="skein-filters" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
      <input
        type="text"
        placeholder="Participant…"
        value={filters.participant}
        onChange={e => update("participant", e.target.value)}
        className="rune-input"
        style={{ maxWidth: "10rem" }}
      />
      <select value={filters.surface} onChange={e => update("surface", e.target.value)} className="rune-input">
        <option value="">All surfaces</option>
        <option value="discord">Discord</option>
        <option value="telegram">Telegram</option>
        <option value="signal">Signal</option>
        <option value="openclaw">OpenClaw</option>
      </select>
      <input
        type="date"
        value={filters.date}
        onChange={e => update("date", e.target.value)}
        className="rune-input"
      />
    </div>
  );
}

// ── Session row (clickable link) ─────────────────────────────────────────────

function SessionRow({ session, onClick }) {
  const icon = SURFACE_ICON[session.surface] || SURFACE_ICON.default;
  const who = session.participants.join(", ") || "unknown";

  return (
    <li className="thread-row" style={{ cursor: "pointer" }} onClick={onClick}>
      <a
        href="#"
        onClick={e => e.preventDefault()}
        className="skein-entry-link"
        style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", textDecoration: "none", color: "inherit", width: "100%" }}
      >
        <span className="thread-icon" aria-hidden="true">{icon}</span>
        <div className="thread-body" style={{ flex: 1, minWidth: 0 }}>
          <span className="thread-label">{who}</span>
          {session.preview && <span className="thread-surface" style={{ display: "block", opacity: 0.7, fontSize: "0.85em" }}>{session.preview}</span>}
        </div>
        <dl className="thread-meta" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <dt className="sr-only">Surface</dt>
          <dd className="thread-tokens">{session.surface}{session.isCurrent ? " (active)" : ""}</dd>
          <dt className="sr-only">Time</dt>
          <dd className="thread-age">{fmtDate(session.firstTimestamp)}</dd>
          <dt className="sr-only">Messages</dt>
          <dd className="thread-cost">{session.messageCount} msgs</dd>
        </dl>
      </a>
    </li>
  );
}

// ── View 1: Session List ─────────────────────────────────────────────────────

function SessionList({ onSelect }) {
  const [sessions, setSessions] = useState([]);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters]   = useState({ participant: "", surface: "", date: "" });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    // Fetch all entries in batches of 100 (API caps at 100 per request).
    // Paginate with offset until all entries are loaded, then group client-side.
    const baseParams = new URLSearchParams();
    baseParams.set("limit", "100");
    if (filters.surface) baseParams.set("surface", filters.surface);
    // participant filter is applied client-side only — the API matches
    // participants[0], which misses outbound entries where the agent
    // (sethren) is listed first instead of the other participant.
    if (filters.date) baseParams.set("date", filters.date);

    (async () => {
      try {
        const all = [];
        let offset = 0;
        const batchSize = 100;
        while (true) {
          const params = new URLSearchParams(baseParams);
          params.set("offset", String(offset));
          const r = await fetch(`/api/skein?${params}`);
          if (!r.ok) throw new Error(r.status);
          const data = await r.json();
          const entries = data.entries ?? [];
          all.push(...entries);
          if (entries.length < batchSize) break;
          offset += batchSize;
        }
        const messages = all.filter(e => e.type !== "session_boundary");
        const boundaries = all.filter(e => e.type === "session_boundary");
        const grouped = groupIntoSessions(messages, boundaries).map(normalizeSession);
        setSessions(grouped);
        setLoading(false);
      } catch (e) {
        setError(`Could not load skein: ${e}`);
        setLoading(false);
      }
    })();
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Client-side filtering is already done via API params, but apply participant
  // filter to session-level participants for extra precision
  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (filters.participant) {
      const q = filters.participant.toLowerCase();
      result = result.filter(s =>
        s.participants.some(p => p.toLowerCase().includes(q))
      );
    }
    return result;
  }, [sessions, filters.participant]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const pageSessions = filteredSessions.slice((page - 1) * pageSize, page * pageSize);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  return (
    <>
      <p className="section-intro">
        The Skein is the woven record — every message that has passed through the Well,
        archived and searchable.
      </p>

      <FilterBar filters={filters} onChange={handleFilterChange} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <p className="threads-summary" style={{ margin: 0 }}>
          {filteredSessions.length > 0
            ? `${filteredSessions.length} session${filteredSessions.length !== 1 ? "s" : ""}`
            : loading ? "Loading…" : "No sessions found"}
        </p>
        <PageSizeSelect value={pageSize} onChange={handlePageSizeChange} />
      </div>

      {loading && <p className="rune-loading">The skein is unwinding…</p>}
      {error && <p className="rune-error">{error}</p>}

      {!loading && pageSessions.length > 0 && (
        <ul className="thread-list" aria-label="Skein sessions">
          {pageSessions.map(s => (
            <SessionRow key={s.id} session={s} onClick={() => onSelect(s)} />
          ))}
        </ul>
      )}

      {!loading && pageSessions.length === 0 && !error && (
        <p className="threads-empty">No sessions match these filters.</p>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <button className="btn-refresh" onClick={load} aria-label="Refresh skein"
        style={{ marginTop: "1rem" }}>
        ↻ Refresh
      </button>
    </>
  );
}

// ── View 2: Conversation Reader ──────────────────────────────────────────────

function ConversationReader({ session, onBack }) {
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch]     = useState("");

  // Build messages from all entries in this session.
  // Each entry has plain text `content`, `participants[0]` as the speaker,
  // and `timestamp` for the time — no parsing needed.
  const allMessages = useMemo(() => {
    const msgs = [];
    for (const entry of session.entries) {
      const rawText = (entry.content || entry.summary || "").toString();
      // Strip [[reply_to_*]] routing tags before checking emptiness —
      // some outbound entries are pure routing tags with no visible content
      const cleanText = rawText.replace(/\[\[\s*reply_to[^\]]*\]\]/gi, "").trim();
      if (!cleanText) continue;
      // Filter system/cron noise messages
      if (Array.isArray(entry.tags) && entry.tags.includes("test")) continue;
      if (/^Conversation pool refreshed/i.test(cleanText)) continue;
      if (/Gateway restart/i.test(cleanText)) continue;
      if (/restart ok/i.test(cleanText)) continue;
      const isOutbound = Array.isArray(entry.tags) && entry.tags.includes("outbound");
      // For outbound entries, speaker is always sethren (or captured_by agent)
      // For inbound, pick the first participant that isn't sethren
      const speaker = isOutbound
        ? (entry.captured_by || "sethren")
        : (entry.participants && entry.participants.find(p => p !== "sethren")) || (entry.participants && entry.participants[0]) || "unknown";
      const d = new Date(entry.timestamp);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      msgs.push({ time, speaker, text: cleanText, entryTimestamp: entry.timestamp, outbound: isOutbound });
    }
    // Sort by full ISO timestamp so same-minute entries appear in correct order
    msgs.sort((a, b) => new Date(a.entryTimestamp) - new Date(b.entryTimestamp));
    return msgs;
  }, [session.entries]);

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return allMessages;
    const q = search.toLowerCase();
    return allMessages.filter(m =>
      m.text.toLowerCase().includes(q) ||
      m.speaker.toLowerCase().includes(q)
    );
  }, [allMessages, search]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));
  const pageMessages = filteredMessages.slice((page - 1) * pageSize, page * pageSize);

  const who = session.participants.join(", ") || "unknown";

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
  };

  const backLink = (
    <a href="#" onClick={e => { e.preventDefault(); onBack(); }}
      style={{ display: "inline-block", marginBottom: "0.5rem" }}>
      ← Back to sessions
    </a>
  );

  const controls = (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", margin: "0.5rem 0" }}>
      <PageSizeSelect value={pageSize} onChange={handlePageSizeChange} label="Msgs per page:" />
      <input
        type="text"
        placeholder="Search messages…"
        value={search}
        onChange={e => handleSearchChange(e.target.value)}
        className="rune-input"
        style={{ maxWidth: "14rem" }}
      />
    </div>
  );

  return (
    <>
      {backLink}
      {controls}

      {/* Header */}
      <div className="status-card" style={{ marginBottom: "0.75rem", padding: "0.75rem" }}>
        <dl className="stat-grid">
          <dt>Session start</dt>
          <dd>{fmtDate(session.firstTimestamp)}</dd>
          <dt>Session end</dt>
          <dd>{session.isCurrent ? "Active" : fmtDate(session.lastTimestamp)}</dd>
          <dt>Participants</dt>
          <dd>{who}</dd>
          <dt>Messages</dt>
          <dd>{allMessages.length}{search && filteredMessages.length !== allMessages.length ? ` (${filteredMessages.length} matching)` : ""}</dd>
          {session.surface && (
            <><dt>Surface</dt><dd>{session.surface}</dd></>
          )}
        </dl>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Message list */}
      <ol className="skein-messages" style={{ listStyle: "none", padding: 0, margin: "0.75rem 0" }}>
        {pageMessages.map((msg, i) => {
          const prevMsg = i > 0 ? pageMessages[i - 1] : null;
          const sameSpeaker = prevMsg && prevMsg.speaker === msg.speaker;
          return (
          <li key={`${page}-${i}`} className={`skein-msg${msg.outbound ? " skein-msg-outbound" : ""}`} style={{
            padding: "0.4rem 0.6rem",
            borderBottom: "1px solid var(--border, rgba(255,255,255,0.06))",
            ...(sameSpeaker ? { marginTop: "0.35rem", borderTop: "1px solid var(--border, rgba(255,255,255,0.04))" } : {}),
            display: "flex", gap: "0.5rem", alignItems: "baseline",
            ...(msg.outbound ? {
              flexDirection: "row-reverse",
              textAlign: "right",
              background: "var(--skein-outbound-bg, rgba(255,255,255,0.03))",
            } : {}),
          }}>
            <time className="skein-msg-time" style={{
              fontSize: "0.8em", opacity: 0.5, flexShrink: 0, fontFamily: "monospace",
            }}>{msg.time}</time>
            <strong className="skein-msg-speaker" style={{
              color: speakerColor(msg.speaker), flexShrink: 0, minWidth: "5em",
            }}>{msg.speaker}</strong>
            <span className="skein-msg-text" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {msg.text}
            </span>
          </li>
          );
        })}
      </ol>

      {pageMessages.length === 0 && (
        <p className="threads-empty">
          {search ? "No messages match your search." : "No messages in this session."}
        </p>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      {backLink}
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TheSkein() {
  const [selectedSession, setSelectedSession] = useState(null);

  return (
    <div className="section-content">
      {selectedSession ? (
        <ConversationReader session={selectedSession} onBack={() => setSelectedSession(null)} />
      ) : (
        <SessionList onSelect={setSelectedSession} />
      )}
    </div>
  );
}
