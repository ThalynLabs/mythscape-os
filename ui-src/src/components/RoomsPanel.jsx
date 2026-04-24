/**
 * RoomsPanel.jsx — The Court
 *
 * "The Court is where the agents gather — each in their own chamber,
 * each reachable by name. Speak, and they will answer."
 *
 * Agent list from GET /api/agents, expandable to show a message input.
 * Send calls POST /api/agents/{agentId}/wake and displays the reply.
 *
 * Accessibility: semantic HTML, keyboard navigation, aria-live for
 * dynamic updates. Valerie uses VoiceOver — every interaction must
 * be announced, every element reachable by keyboard.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// Short model label — strip provider prefix for display.
// Same pattern as TheThreads.jsx uses.
function modelLabel(model) {
  if (!model) return null;
  return model
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "GPT-")
    .replace(/^gemini-/, "Gemini ")
    .replace(/-(\d)/, " $1")
    .replace(/^(.)/, c => c.toUpperCase());
}

// ── useCourtRoster ──────────────────────────────────────────────────────────────────
function useCourtRoster() {
  const [roster,    setRoster]    = useState(null);
  const [rosterErr, setRosterErr] = useState(null);

  useEffect(() => {
    fetch("/api/court/roster")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setRosterErr("No response from daemon"); return; }
        if (data.ok && data.content) {
          setRoster(data.content);
          setRosterErr(null);
        } else {
          setRosterErr(data.error || "Unknown error");
        }
      })
      .catch(e => setRosterErr(e.message));
  }, []);

  return { roster, rosterErr };
}

export default function RoomsPanel({ agents }) {
  const [agentList, setAgentList] = useState([]);
  const [agentError, setAgentError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [messages, setMessages] = useState({});  // agentId → [{role, content, ts}]
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Phase 4: court roster
  const { roster, rosterErr } = useCourtRoster();

  // Fetch agents from daemon
  useEffect(() => {
    fetch("/api/agents")
      .then(r => r.json())
      .then(data => {
        if (data?.ok && data.agents?.length) {
          setAgentList(data.agents);
          setAgentError(null);
        } else {
          setAgentError(data?.error || "Could not load agents from daemon");
        }
      })
      .catch(e => setAgentError(`Could not reach daemon: ${e.message}`));
  }, []);

  // Focus input when expanding an agent
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  // Scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, expanded]);

  const toggleAgent = useCallback((agentId) => {
    setExpanded(prev => prev === agentId ? null : agentId);
    setError(null);
    setInputText("");
  }, []);

  const sendMessage = useCallback(async (agentId) => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    // Add user message to local state immediately
    setMessages(prev => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), {
        role: "user",
        content: text,
        ts: Date.now(),
      }],
    }));
    setInputText("");

    try {
      const resp = await fetch(`/api/agents/${encodeURIComponent(agentId)}/wake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await resp.json();

      if (data.ok && data.reply) {
        setMessages(prev => ({
          ...prev,
          [agentId]: [...(prev[agentId] || []), {
            role: "assistant",
            content: data.reply,
            ts: Date.now(),
          }],
        }));
      } else {
        setError(data.error || `Request failed (${resp.status})`);
      }
    } catch (e) {
      setError(`Could not reach the daemon: ${e.message}`);
    } finally {
      setSending(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }, [inputText, sending]);

  const handleKeyDown = useCallback((e, agentId) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(agentId);
    }
  }, [sendMessage]);

  const agentMessages = expanded ? (messages[expanded] || []) : [];

  return (
    <div className="section-content">
      <p className="section-intro">
        The Court is where the agents gather — each in their own chamber,
        each reachable by name. Speak to any agent directly, and they will answer
        from wherever they stand in the castle.
      </p>

      {/* Agent list */}
      <ul className="court-agent-list" role="list" aria-label="Castle agents">
        {agentList.map(agent => {
          const agentId = agent.agentId || agent.id;
          const isExpanded = expanded === agentId;
          const displayName = agent.displayName || agentId;

          return (
            <li key={agentId} className={`court-agent-item ${isExpanded ? "court-agent-expanded" : ""}`}>
              <button
                className="court-agent-header"
                onClick={() => toggleAgent(agentId)}
                aria-expanded={isExpanded}
                aria-controls={`court-room-${agentId}`}
                aria-label={`${displayName}${agent.model ? `, model ${modelLabel(agent.model) || agent.model}` : ""}. ${isExpanded ? "Collapse" : "Expand"} to send messages.`}
              >
                <span className="court-agent-name">{displayName}</span>
                {agent.model && (
                  <span className="court-agent-model">{modelLabel(agent.model) || agent.model}</span>
                )}
                <span className="court-agent-chevron" aria-hidden="true">
                  {isExpanded ? "▾" : "▸"}
                </span>
              </button>

              {isExpanded && (
                <div
                  id={`court-room-${agentId}`}
                  className="court-room"
                  role="region"
                  aria-label={`Conversation with ${displayName}`}
                >
                  {/* Messages area */}
                  <div className="court-messages" role="log" aria-live="polite" aria-label="Messages">
                    {agentMessages.length === 0 && (
                      <p className="court-empty">
                        No messages yet. Send something to wake {displayName}.
                      </p>
                    )}
                    {agentMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`court-message court-message-${msg.role}`}
                      >
                        <span className="court-message-role">
                          {msg.role === "user" ? "You" : displayName}
                        </span>
                        <span className="court-message-content">{msg.content}</span>
                      </div>
                    ))}
                    <div ref={expanded === agentId ? messagesEndRef : null} />
                  </div>

                  {/* Error display */}
                  {error && (
                    <output className="court-error" role="alert">
                      {error}
                    </output>
                  )}

                  {/* Input area */}
                  <div className="court-input-row">
                    <label htmlFor={`court-input-${agentId}`} className="sr-only">
                      Message for {displayName}
                    </label>
                    <textarea
                      id={`court-input-${agentId}`}
                      ref={inputRef}
                      className="court-input"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => handleKeyDown(e, agentId)}
                      placeholder={`Speak to ${displayName}…`}
                      rows={2}
                      disabled={sending}
                      aria-label={`Type a message for ${displayName}`}
                    />
                    <button
                      className="court-send-btn"
                      onClick={() => sendMessage(agentId)}
                      disabled={sending || !inputText.trim()}
                      aria-label={sending ? "Sending message…" : `Send message to ${displayName}`}
                    >
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>

                  {/* Status announcement for screen readers */}
                  <output className="sr-only" role="status" aria-live="polite">
                    {sending ? `Sending message to ${displayName}…` : ""}
                  </output>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {agentList.length === 0 && agentError && (
        <output className="court-error" role="alert">
          Court roster unavailable: {agentError}
        </output>
      )}
      {agentList.length === 0 && !agentError && (
        <p className="court-empty">No agents found. The Court stands empty.</p>
      )}

      {/* Phase 4: Court hierarchy roster from Hermes
          Collapsible <details>/<summary> — VoiceOver reads <summary> then expands.
          <pre> preserves the markdown structure (code blocks, tables, sections).
          aria-label on <pre> gives VoiceOver a useful announcement. */}
      <details className="court-roster">
        <summary className="court-roster-heading">
          Court hierarchy — squad assignments
        </summary>
        {rosterErr && (
          <output className="court-error" role="alert">
            Could not load roster: {rosterErr}
          </output>
        )}
        {!rosterErr && !roster && (
          <p className="muted" style={{ marginTop: "0.5rem" }}>Loading roster…</p>
        )}
        {roster && (
          <pre
            className="court-roster-body"
            aria-label="Court hierarchy roster — squad assignments"
            tabIndex={0}
          >{roster}</pre>
        )}
      </details>
    </div>
  );
}
