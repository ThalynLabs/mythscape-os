import { useState, useEffect, useRef, useCallback } from "react";

// --- Thematic Constants ---
const REALMS = {
  whatsapp: { name: "Midgard", desc: "WhatsApp Ñ the mortal channel" },
  telegram: { name: "Alfheim", desc: "Telegram Ñ the light messenger" },
  slack: { name: "Asgard", desc: "Slack Ñ the hall of builders" },
  discord: { name: "Vanaheim", desc: "Discord Ñ the community realm" },
  signal: { name: "Niflheim", desc: "Signal Ñ the veiled channel" },
  webchat: { name: "Muspelheim", desc: "WebChat Ñ the forge interface" },
};

const MOCK_STATE = {
  gateway: {
    status: "running",
    uptime: "14 days, 7 hours",
    lastHeartbeat: "3 minutes ago",
    wsPort: 18789,
    version: "0.9.42",
  },
  agents: [
    {
      id: "primary",
      name: "Primary Agent",
      model: "claude-opus-4-6",
      sessionsActive: 3,
      memoryEntries: 847,
      lastActive: "Just now",
    },
  ],
  channels: [
    { id: "whatsapp", realm: "whatsapp", paired: true, lastMessage: "2 min ago" },
    { id: "telegram", realm: "telegram", paired: true, lastMessage: "18 min ago" },
    { id: "slack", realm: "slack", paired: true, lastMessage: "1 hour ago" },
    { id: "discord", realm: "discord", paired: false, lastMessage: "Ñ" },
    { id: "signal", realm: "signal", paired: false, lastMessage: "Ñ" },
  ],
  skills: {
    bundled: [
      { name: "browser", active: true, desc: "Web browsing and automation" },
      { name: "canvas", active: true, desc: "Visual workspace generation" },
      { name: "cron", active: true, desc: "Scheduled heartbeat tasks" },
      { name: "sessions", active: true, desc: "Multi-session management" },
      { name: "nodes", active: false, desc: "Companion device routing" },
    ],
    managed: [
      { name: "claude-code-skill", active: true, desc: "MCP integration bridge" },
      { name: "summarize", active: true, desc: "Document distillation" },
      { name: "birthday-reminder", active: false, desc: "Date tracking and alerts" },
    ],
    workspace: [
      { name: "morning-brief", active: true, desc: "Custom standup compiler" },
    ],
  },
  security: {
    sandboxMode: "non-main",
    dmPolicy: "pairing-required",
    authToken: true,
    lastAudit: "2 days ago",
    openIssues: 0,
  },
  heartbeat: {
    interval: "30 minutes",
    lastRun: "3 minutes ago",
    nextRun: "27 minutes",
    tasks: [
      { name: "Check GitHub PRs", lastResult: "3 open, CI passing" },
      { name: "Summarize overnight Slack", lastResult: "Quiet night, 2 threads" },
      { name: "Weather briefing", lastResult: "Denver: 42¡F, clear" },
    ],
  },
};

// --- Sonification: subtle audio cues for spatial navigation ---
function useNavigationSound() {
  const audioCtx = useRef(null);
  const play = useCallback((freq, duration = 0.08) => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* silent fail */ }
  }, []);
  return {
    navigate: () => play(520, 0.06),
    expand: () => play(440, 0.1),
    success: () => { play(523, 0.08); setTimeout(() => play(659, 0.08), 90); },
    warning: () => play(330, 0.15),
  };
}

// --- Navigation Component ---
// Uses <nav> landmark with an ordered list Ñ VoiceOver reads "navigation, list, 6 items"
function Pathways({ current, onNavigate, sounds }) {
  const paths = [
    { id: "well", label: "The Well", icon: "?", hint: "System overview and health" },
    { id: "roots", label: "The Roots", icon: "?", hint: "Channel connections" },
    { id: "norns", label: "The Norns", icon: "?", hint: "Agents and sessions" },
    { id: "branches", label: "The Branches", icon: "?", hint: "Skills and capabilities" },
    { id: "runes", label: "The Runes", icon: "?", hint: "Configuration" },
    { id: "hearth", label: "The Hearth", icon: "?", hint: "Security and watchkeeping" },
  ];

  return (
    <nav aria-label="Well of Urd Ñ main navigation">
      <ol style={{
        listStyle: "none", padding: 0, margin: 0,
        display: "flex", flexDirection: "column", gap: "2px",
      }}>
        {paths.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => { onNavigate(p.id); sounds.navigate(); }}
              aria-current={current === p.id ? "page" : undefined}
              aria-describedby={`hint-${p.id}`}
              style={{
                display: "block", width: "100%",
                padding: "14px 20px",
                background: current === p.id ? "var(--surface-active)" : "transparent",
                color: current === p.id ? "var(--text-primary)" : "var(--text-secondary)",
                border: "none",
                borderLeft: current === p.id ? "3px solid var(--accent)" : "3px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--font-body)",
                fontSize: "1rem",
                fontWeight: current === p.id ? "600" : "400",
                letterSpacing: "0.02em",
                transition: "all 0.15s ease",
              }}
            >
              <span aria-hidden="true" style={{ marginRight: "12px", opacity: 0.5 }}>{p.icon}</span>
              {p.label}
            </button>
            <span id={`hint-${p.id}`} hidden>{p.hint}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// --- The Well: System Overview ---
// Uses <output> for live status, semantic headings, native details/summary
function TheWell({ state }) {
  const gw = state.gateway;
  const activeChannels = state.channels.filter((c) => c.paired).length;
  const totalChannels = state.channels.length;

  return (
    <section aria-labelledby="well-heading">
      <h2 id="well-heading" style={styles.sectionHeading}>The Well</h2>
      <p style={styles.sectionIntro}>
        The waters run deep here. This is the heart of your OpenClaw instance Ñ 
        the Gateway that draws all channels together and keeps the tree alive.
      </p>

      {/* Status Ñ semantic <output> for live data */}
      <output aria-label="Gateway status" style={styles.statusBlock}>
        <p style={styles.statusLine}>
          <StatusIndicator status={gw.status} />
          <strong>Gateway is {gw.status}</strong>
          <span style={styles.statusMeta}> Ñ version {gw.version} on port {gw.wsPort}</span>
        </p>
      </output>

      <dl style={styles.descList}>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Uptime</dt>
          <dd style={styles.descDef}>{gw.uptime}</dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Last heartbeat</dt>
          <dd style={styles.descDef}>{gw.lastHeartbeat}</dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Channels paired</dt>
          <dd style={styles.descDef}>{activeChannels} of {totalChannels} realms connected</dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Active sessions</dt>
          <dd style={styles.descDef}>{state.agents.reduce((a, ag) => a + ag.sessionsActive, 0)}</dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Security</dt>
          <dd style={styles.descDef}>
            {state.security.openIssues === 0
              ? "All clear Ñ no issues found"
              : `${state.security.openIssues} issue${state.security.openIssues > 1 ? "s" : ""} need attention`}
          </dd>
        </div>
      </dl>

      <details style={styles.disclosure}>
        <summary style={styles.disclosureSummary}>Heartbeat tasks Ñ Skuld's schedule</summary>
        <div style={styles.disclosureContent}>
          <p style={{ margin: "0 0 12px", opacity: 0.7 }}>
            Next heartbeat in {state.heartbeat.nextRun}. Interval: {state.heartbeat.interval}.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {state.heartbeat.tasks.map((t, i) => (
              <li key={i} style={styles.taskItem}>
                <strong>{t.name}</strong>
                <span style={styles.taskResult}>{t.lastResult}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}

// --- The Roots: Channel Management ---
function TheRoots({ state, sounds }) {
  return (
    <section aria-labelledby="roots-heading">
      <h2 id="roots-heading" style={styles.sectionHeading}>The Roots</h2>
      <p style={styles.sectionIntro}>
        Nine realms, each reached by a different root of the World Tree. 
        These are your messaging channels Ñ the paths through which words travel to and from the Well.
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {state.channels.map((ch) => {
          const realm = REALMS[ch.realm];
          return (
            <li key={ch.id} style={styles.rootItem}>
              <details style={{ margin: 0 }}>
                <summary style={styles.rootSummary}>
                  <span style={styles.rootName}>
                    <StatusIndicator status={ch.paired ? "running" : "inactive"} />
                    {realm.name}
                  </span>
                  <span style={styles.rootDesc}>{realm.desc}</span>
                  <span style={styles.rootStatus}>
                    {ch.paired ? `Active Ñ last message ${ch.lastMessage}` : "Not yet paired"}
                  </span>
                </summary>
                <div style={styles.disclosureContent}>
                  {ch.paired ? (
                    <div>
                      <p>This root is alive and drawing water. Messages flow freely.</p>
                      <div style={styles.actionRow}>
                        <button style={styles.actionBtn} onClick={() => sounds.warning()}>
                          Sever this root
                        </button>
                        <button style={styles.actionBtnSecondary}>View recent messages</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p>This root has not yet taken hold. Pair a device to open the channel.</p>
                      <button style={styles.actionBtn} onClick={() => sounds.success()}>
                        Begin pairing ritual
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- The Norns: Agent & Session Management ---
function TheNorns({ state }) {
  const agent = state.agents[0];
  return (
    <section aria-labelledby="norns-heading">
      <h2 id="norns-heading" style={styles.sectionHeading}>The Norns</h2>
      <p style={styles.sectionIntro}>
        Three sisters tend the Well. Urd holds what has been Ñ your agent's memory and conversation history. 
        Verdandi shapes what is Ñ active sessions and live connections. 
        Skuld weaves what shall be Ñ the heartbeat, the cron, the tasks yet to run.
      </p>

      {/* Urd Ñ Memory */}
      <article style={styles.nornArticle}>
        <h3 style={styles.nornName}>Urd Ñ What Has Been</h3>
        <p style={styles.nornDesc}>Memory and history. {agent.memoryEntries} threads preserved in the Well.</p>
        <details style={styles.disclosure}>
          <summary style={styles.disclosureSummary}>Agent identity and memory</summary>
          <div style={styles.disclosureContent}>
            <dl style={styles.descList}>
              <div style={styles.descPair}>
                <dt style={styles.descTerm}>Model</dt>
                <dd style={styles.descDef}>{agent.model}</dd>
              </div>
              <div style={styles.descPair}>
                <dt style={styles.descTerm}>Memory entries</dt>
                <dd style={styles.descDef}>{agent.memoryEntries} in MEMORY.md</dd>
              </div>
              <div style={styles.descPair}>
                <dt style={styles.descTerm}>SOUL.md</dt>
                <dd style={styles.descDef}>Configured Ñ defines who your agent is</dd>
              </div>
              <div style={styles.descPair}>
                <dt style={styles.descTerm}>AGENTS.md</dt>
                <dd style={styles.descDef}>Active Ñ behavioral directives set</dd>
              </div>
            </dl>
            <div style={styles.actionRow}>
              <button style={styles.actionBtn}>View memory threads</button>
              <button style={styles.actionBtnSecondary}>Edit soul</button>
            </div>
          </div>
        </details>
      </article>

      {/* Verdandi Ñ Present */}
      <article style={styles.nornArticle}>
        <h3 style={styles.nornName}>Verdandi Ñ What Is</h3>
        <p style={styles.nornDesc}>{agent.sessionsActive} active sessions. Last active: {agent.lastActive}.</p>
        <details style={styles.disclosure}>
          <summary style={styles.disclosureSummary}>Active sessions</summary>
          <div style={styles.disclosureContent}>
            <p>
              {agent.sessionsActive} conversations are open across your paired channels.
              The agent is processing messages in real time.
            </p>
            <div style={styles.actionRow}>
              <button style={styles.actionBtn}>View all sessions</button>
              <button style={styles.actionBtnSecondary}>End idle sessions</button>
            </div>
          </div>
        </details>
      </article>

      {/* Skuld Ñ Future */}
      <article style={styles.nornArticle}>
        <h3 style={styles.nornName}>Skuld Ñ What Shall Be</h3>
        <p style={styles.nornDesc}>
          Next heartbeat in {state.heartbeat.nextRun}. {state.heartbeat.tasks.length} tasks queued.
        </p>
        <details style={styles.disclosure}>
          <summary style={styles.disclosureSummary}>Scheduled tasks and heartbeat</summary>
          <div style={styles.disclosureContent}>
            <p>
              The heartbeat wakes every {state.heartbeat.interval}. Skuld reads the HEARTBEAT.md 
              and decides what needs doing.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
              {state.heartbeat.tasks.map((t, i) => (
                <li key={i} style={styles.taskItem}>
                  <strong>{t.name}</strong>
                  <span style={styles.taskResult}>Last: {t.lastResult}</span>
                </li>
              ))}
            </ul>
            <div style={styles.actionRow}>
              <button style={styles.actionBtn}>Edit heartbeat tasks</button>
              <button style={styles.actionBtnSecondary}>Trigger heartbeat now</button>
            </div>
          </div>
        </details>
      </article>
    </section>
  );
}

// --- The Branches: Skills Management ---
function TheBranches({ state, sounds }) {
  const renderSkillGroup = (title, desc, skills, groupId) => (
    <article key={groupId} style={styles.nornArticle}>
      <h3 style={styles.nornName}>{title}</h3>
      <p style={styles.nornDesc}>{desc}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {skills.map((sk) => (
          <li key={sk.name} style={styles.skillItem}>
            <div style={styles.skillInfo}>
              <strong>{sk.name}</strong>
              <span style={styles.skillDesc}>{sk.desc}</span>
            </div>
            <button
              onClick={() => sk.active ? sounds.warning() : sounds.success()}
              style={{
                ...styles.toggleBtn,
                background: sk.active ? "var(--accent)" : "var(--surface-dim)",
                color: sk.active ? "var(--bg-deep)" : "var(--text-secondary)",
              }}
              aria-pressed={sk.active}
            >
              {sk.active ? "Active" : "Dormant"}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );

  return (
    <section aria-labelledby="branches-heading">
      <h2 id="branches-heading" style={styles.sectionHeading}>The Branches</h2>
      <p style={styles.sectionIntro}>
        Yggdrasil's branches reach into every realm, each bearing different fruit. 
        These are your agent's skills Ñ bundled with the tree, tended by the community, 
        or grown in your own workspace.
      </p>

      {renderSkillGroup(
        "Innate branches Ñ bundled skills",
        `${state.skills.bundled.filter(s => s.active).length} of ${state.skills.bundled.length} awakened`,
        state.skills.bundled,
        "bundled"
      )}
      {renderSkillGroup(
        "Tended branches Ñ managed skills",
        `Installed from ClawHub. ${state.skills.managed.filter(s => s.active).length} active.`,
        state.skills.managed,
        "managed"
      )}
      {renderSkillGroup(
        "Your branches Ñ workspace skills",
        "Skills you've planted yourself.",
        state.skills.workspace,
        "workspace"
      )}

      <details style={styles.disclosure}>
        <summary style={styles.disclosureSummary}>Search ClawHub for new skills</summary>
        <div style={styles.disclosureContent}>
          <p>Over 13,000 community-built skills are available in the ClawHub registry.</p>
          <label htmlFor="skill-search" style={styles.label}>Search by name or capability</label>
          <input
            id="skill-search"
            type="search"
            placeholder="e.g. github, calendar, summarize..."
            style={styles.searchInput}
          />
        </div>
      </details>
    </section>
  );
}

// --- The Runes: Configuration ---
function TheRunes({ state }) {
  return (
    <section aria-labelledby="runes-heading">
      <h2 id="runes-heading" style={styles.sectionHeading}>The Runes</h2>
      <p style={styles.sectionIntro}>
        Carved into the roots of the tree, these are the deep settings that shape 
        how your agent thinks, speaks, and connects. Change them deliberately Ñ 
        each rune alters the weave.
      </p>

      <article style={styles.nornArticle}>
        <h3 style={styles.nornName}>Model and Provider</h3>
        <fieldset style={styles.fieldset}>
          <legend style={styles.legend}>Choose the mind behind your agent</legend>
          <label htmlFor="model-select" style={styles.label}>Active model</label>
          <select id="model-select" defaultValue="claude-opus-4-6" style={styles.selectInput}>
            <option value="claude-opus-4-6">Claude Opus 4.6 Ñ deep reasoning, long context</option>
            <option value="claude-sonnet-4-5">Claude Sonnet 4.5 Ñ balanced capability</option>
            <option value="gpt-4o">GPT-4o Ñ multimodal versatility</option>
            <option value="local-ollama">Local model via Ollama</option>
          </select>
        </fieldset>
      </article>

      <article style={styles.nornArticle}>
        <h3 style={styles.nornName}>Identity files</h3>
        <p style={styles.nornDesc}>
          These Markdown files define who your agent is and how it behaves.
        </p>
        <dl style={styles.descList}>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>SOUL.md</dt>
            <dd style={styles.descDef}>The agent's core identity Ñ personality, tone, values</dd>
          </div>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>AGENTS.md</dt>
            <dd style={styles.descDef}>Behavioral directives and security rules</dd>
          </div>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>USER.md</dt>
            <dd style={styles.descDef}>Context about you Ñ preferences, routines, context</dd>
          </div>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>HEARTBEAT.md</dt>
            <dd style={styles.descDef}>Skuld's checklist Ñ what to do on each wake</dd>
          </div>
        </dl>
        <div style={styles.actionRow}>
          <button style={styles.actionBtn}>Edit identity files</button>
        </div>
      </article>

      <article style={styles.nornArticle}>
        <h3 style={styles.nornName}>Gateway tuning</h3>
        <dl style={styles.descList}>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>WebSocket port</dt>
            <dd style={styles.descDef}>{state.gateway.wsPort}</dd>
          </div>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>Heartbeat interval</dt>
            <dd style={styles.descDef}>{state.heartbeat.interval}</dd>
          </div>
          <div style={styles.descPair}>
            <dt style={styles.descTerm}>Config location</dt>
            <dd style={styles.descDef}>~/.openclaw/openclaw.json</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

// --- The Hearth: Security ---
function TheHearth({ state, sounds }) {
  const sec = state.security;
  return (
    <section aria-labelledby="hearth-heading">
      <h2 id="hearth-heading" style={styles.sectionHeading}>The Hearth</h2>
      <p style={styles.sectionIntro}>
        The fire that wards against the cold. This is where you guard the Well Ñ 
        managing who may approach, what the agent may touch, and how deeply 
        the roots are allowed to reach.
      </p>

      <output aria-label="Security status" style={styles.statusBlock}>
        <p style={styles.statusLine}>
          <StatusIndicator status={sec.openIssues === 0 ? "running" : "warning"} />
          <strong>
            {sec.openIssues === 0
              ? "The Hearth burns steady Ñ no issues found"
              : `${sec.openIssues} issue${sec.openIssues > 1 ? "s" : ""} require attention`}
          </strong>
        </p>
      </output>

      <dl style={styles.descList}>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Sandbox mode</dt>
          <dd style={styles.descDef}>
            {sec.sandboxMode === "non-main"
              ? "Non-main sessions sandboxed Ñ group chats run in Docker isolation"
              : sec.sandboxMode}
          </dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>DM policy</dt>
          <dd style={styles.descDef}>
            {sec.dmPolicy === "pairing-required"
              ? "Pairing required Ñ strangers must present a code"
              : sec.dmPolicy}
          </dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Auth token</dt>
          <dd style={styles.descDef}>{sec.authToken ? "Set and active" : "Not configured Ñ exposed"}</dd>
        </div>
        <div style={styles.descPair}>
          <dt style={styles.descTerm}>Last audit</dt>
          <dd style={styles.descDef}>{sec.lastAudit}</dd>
        </div>
      </dl>

      <div style={styles.actionRow}>
        <button style={styles.actionBtn} onClick={() => sounds.success()}>
          Run openclaw doctor
        </button>
        <button style={styles.actionBtnSecondary}>View audit log</button>
      </div>
    </section>
  );
}

// --- Status Indicator ---
function StatusIndicator({ status }) {
  const color =
    status === "running" ? "var(--status-ok)" :
    status === "warning" ? "var(--status-warn)" :
    "var(--status-off)";
  const label =
    status === "running" ? "healthy" :
    status === "warning" ? "needs attention" :
    "offline";

  return (
    <span
      aria-label={label}
      style={{
        display: "inline-block",
        width: "10px", height: "10px",
        borderRadius: "50%",
        backgroundColor: color,
        marginRight: "10px",
        verticalAlign: "middle",
        boxShadow: status === "running" ? `0 0 6px ${color}` : "none",
      }}
    />
  );
}

// --- Main App ---
export default function WellOfUrd() {
  const [currentPath, setCurrentPath] = useState("well");
  const mainRef = useRef(null);
  const sounds = useNavigationSound();

  // When path changes, move focus to main content heading
  useEffect(() => {
    if (mainRef.current) {
      const heading = mainRef.current.querySelector("h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }, [currentPath]);

  const renderContent = () => {
    switch (currentPath) {
      case "well": return <TheWell state={MOCK_STATE} />;
      case "roots": return <TheRoots state={MOCK_STATE} sounds={sounds} />;
      case "norns": return <TheNorns state={MOCK_STATE} />;
      case "branches": return <TheBranches state={MOCK_STATE} sounds={sounds} />;
      case "runes": return <TheRunes state={MOCK_STATE} />;
      case "hearth": return <TheHearth state={MOCK_STATE} sounds={sounds} />;
      default: return <TheWell state={MOCK_STATE} />;
    }
  };

  return (
    <div style={styles.root}>
      <style>{cssVariables}</style>

      {/* Skip link Ñ the first thing VoiceOver encounters */}
      <a href="#main-content" style={styles.skipLink}>
        Skip to main content
      </a>

      <div style={styles.layout}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          <header style={styles.header}>
            <h1 style={styles.title}>The Well of Urd</h1>
            <p style={styles.subtitle}>OpenClaw Control</p>
          </header>
          <Pathways current={currentPath} onNavigate={setCurrentPath} sounds={sounds} />
          <footer style={styles.footer}>
            <p style={styles.footerText}>v{MOCK_STATE.gateway.version}</p>
            <p style={styles.footerText}>{MOCK_STATE.gateway.status === "running" ? "Gateway alive" : "Gateway down"}</p>
          </footer>
        </div>

        {/* Main content */}
        <main id="main-content" ref={mainRef} style={styles.main}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// --- CSS Variables & Theme ---
const cssVariables = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600&display=swap');

  :root {
    --bg-deep: #0a0c0f;
    --bg-surface: #12151a;
    --surface-active: #1a1e26;
    --surface-dim: #1e222b;
    --border: #2a2f3a;
    --border-subtle: #1e222b;

    --text-primary: #d4cfc4;
    --text-secondary: #8a8578;
    --text-muted: #5a564e;

    --accent: #b8956a;
    --accent-dim: #8a6d4a;

    --status-ok: #6b9e78;
    --status-warn: #c4954a;
    --status-off: #5a564e;

    --font-display: 'Cormorant Garamond', Georgia, serif;
    --font-body: 'Source Sans 3', -apple-system, system-ui, sans-serif;

    --radius: 4px;
    --space-xs: 6px;
    --space-sm: 12px;
    --space-md: 20px;
    --space-lg: 32px;
    --space-xl: 48px;
  }

  *, *::before, *::after { box-sizing: border-box; }

  /* Focus styles Ñ critical for keyboard/VoiceOver navigation */
  :focus-visible {
    outline: 2px solid var(--accent) !important;
    outline-offset: 2px !important;
  }

  /* Reduce motion for users who prefer it */
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }

  /* High contrast mode support */
  @media (forced-colors: active) {
    button { border: 1px solid ButtonText; }
  }

  details > summary { cursor: pointer; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::marker { content: ''; }

  /* VoiceOver reads details/summary state natively Ñ no ARIA needed */
  details[open] > summary::before { content: '? '; }
  details:not([open]) > summary::before { content: '? '; }
`;

// --- Styles Object ---
const styles = {
  root: {
    background: "var(--bg-deep)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    minHeight: "100vh",
    fontSize: "16px",
    lineHeight: 1.6,
  },
  skipLink: {
    position: "absolute",
    left: "-9999px",
    top: "auto",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    // Becomes visible on focus:
    zIndex: 1000,
    // Using clip for off-screen, will override on focus via CSS
  },
  layout: {
    display: "flex",
    minHeight: "100vh",
  },
  sidebar: {
    width: "260px",
    flexShrink: 0,
    background: "var(--bg-surface)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    height: "100vh",
    overflowY: "auto",
  },
  header: {
    padding: "var(--space-lg) var(--space-md) var(--space-md)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
    letterSpacing: "0.03em",
  },
  subtitle: {
    fontFamily: "var(--font-body)",
    fontSize: "0.8rem",
    fontWeight: 300,
    color: "var(--text-muted)",
    margin: "4px 0 0",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  footer: {
    marginTop: "auto",
    padding: "var(--space-md)",
    borderTop: "1px solid var(--border-subtle)",
  },
  footerText: {
    margin: "2px 0",
    fontSize: "0.75rem",
    color: "var(--text-muted)",
  },
  main: {
    flex: 1,
    padding: "var(--space-xl) var(--space-xl) var(--space-xl) var(--space-lg)",
    maxWidth: "760px",
    overflowY: "auto",
  },
  sectionHeading: {
    fontFamily: "var(--font-display)",
    fontSize: "2rem",
    fontWeight: 500,
    color: "var(--text-primary)",
    margin: "0 0 8px",
    letterSpacing: "0.02em",
  },
  sectionIntro: {
    color: "var(--text-secondary)",
    fontSize: "1rem",
    lineHeight: 1.7,
    margin: "0 0 var(--space-lg)",
    maxWidth: "600px",
    fontWeight: 300,
  },
  statusBlock: {
    display: "block",
    padding: "var(--space-md)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius)",
    marginBottom: "var(--space-lg)",
  },
  statusLine: {
    margin: 0,
    fontSize: "1rem",
  },
  statusMeta: {
    color: "var(--text-secondary)",
    fontWeight: 300,
  },
  descList: {
    margin: "0 0 var(--space-md)",
    padding: 0,
  },
  descPair: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "10px 0",
    borderBottom: "1px solid var(--border-subtle)",
    gap: "var(--space-md)",
  },
  descTerm: {
    color: "var(--text-secondary)",
    fontSize: "0.9rem",
    fontWeight: 400,
    flexShrink: 0,
  },
  descDef: {
    margin: 0,
    textAlign: "right",
    fontSize: "0.9rem",
    color: "var(--text-primary)",
  },
  disclosure: {
    margin: "var(--space-md) 0",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius)",
    overflow: "hidden",
  },
  disclosureSummary: {
    padding: "var(--space-sm) var(--space-md)",
    fontWeight: 500,
    fontSize: "0.95rem",
    color: "var(--text-primary)",
    background: "var(--bg-surface)",
    userSelect: "none",
  },
  disclosureContent: {
    padding: "var(--space-md)",
    borderTop: "1px solid var(--border-subtle)",
    background: "var(--surface-dim)",
    color: "var(--text-secondary)",
    fontSize: "0.9rem",
    lineHeight: 1.7,
  },
  nornArticle: {
    marginBottom: "var(--space-lg)",
    paddingBottom: "var(--space-lg)",
    borderBottom: "1px solid var(--border-subtle)",
  },
  nornName: {
    fontFamily: "var(--font-display)",
    fontSize: "1.3rem",
    fontWeight: 500,
    color: "var(--accent)",
    margin: "0 0 6px",
  },
  nornDesc: {
    color: "var(--text-secondary)",
    fontSize: "0.9rem",
    margin: "0 0 var(--space-sm)",
    fontWeight: 300,
  },
  rootItem: {
    borderBottom: "1px solid var(--border-subtle)",
  },
  rootSummary: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "var(--space-sm) var(--space-md)",
  },
  rootName: {
    fontFamily: "var(--font-display)",
    fontSize: "1.15rem",
    fontWeight: 500,
    color: "var(--text-primary)",
  },
  rootDesc: {
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
    fontWeight: 300,
  },
  rootStatus: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
  },
  skillItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid var(--border-subtle)",
    gap: "var(--space-md)",
  },
  skillInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  skillDesc: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    fontWeight: 300,
  },
  toggleBtn: {
    padding: "6px 14px",
    border: "none",
    borderRadius: "var(--radius)",
    fontSize: "0.8rem",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    letterSpacing: "0.03em",
    flexShrink: 0,
  },
  actionRow: {
    display: "flex",
    gap: "var(--space-sm)",
    marginTop: "var(--space-md)",
    flexWrap: "wrap",
  },
  actionBtn: {
    padding: "10px 20px",
    background: "var(--accent)",
    color: "var(--bg-deep)",
    border: "none",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-body)",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  actionBtnSecondary: {
    padding: "10px 20px",
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-body)",
    fontSize: "0.9rem",
    fontWeight: 400,
    cursor: "pointer",
  },
  taskItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "8px 0",
    borderBottom: "1px solid var(--border-subtle)",
    gap: "var(--space-md)",
  },
  taskResult: {
    color: "var(--text-muted)",
    fontSize: "0.85rem",
    fontWeight: 300,
    textAlign: "right",
  },
  fieldset: {
    border: "none",
    padding: 0,
    margin: 0,
  },
  legend: {
    color: "var(--text-secondary)",
    fontSize: "0.9rem",
    fontWeight: 300,
    marginBottom: "var(--space-sm)",
  },
  label: {
    display: "block",
    color: "var(--text-secondary)",
    fontSize: "0.85rem",
    marginBottom: "6px",
    fontWeight: 400,
  },
  selectInput: {
    width: "100%",
    padding: "10px 14px",
    background: "var(--surface-dim)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-body)",
    fontSize: "0.9rem",
  },
  searchInput: {
    width: "100%",
    padding: "10px 14px",
    background: "var(--surface-dim)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-body)",
    fontSize: "0.9rem",
  },
};