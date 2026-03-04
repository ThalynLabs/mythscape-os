/**
 * Chat.jsx — Urðarbrunnr chat panel
 *
 * Faithful React port of the original chat.js + index.html chat model.
 * Preserved exactly:
 *  - SSE streaming with JS buffer (VoiceOver never sees mid-stream tokens)
 *  - Single atomic innerHTML write on finalizeStream
 *  - sr-only live region announces complete messages only
 *  - Message queue while streaming
 *  - Stop button (AbortController)
 *  - Image paste → /api/attach-image → path injected into message
 *  - Up-arrow history recall (double-press from position 0)
 *  - Copy-as-text / copy-as-markdown dropdown per message
 *  - Copy buttons on fenced code blocks
 *  - Notification sounds (chime/ping/bell/drop)
 *  - Auto-resize textarea
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ── Session ID ────────────────────────────────────────────────────────────────
function getOrCreateSessionId() {
  const key = "well-session-id";
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}

function resetSessionId() {
  const id = crypto.randomUUID();
  sessionStorage.setItem("well-session-id", id);
  return id;
}

// ── Notification sound ────────────────────────────────────────────────────────
const audioCtxRef = { current: null };
function getAudioCtx() {
  if (!audioCtxRef.current)
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtxRef.current.state === "suspended")
    audioCtxRef.current.resume().catch(() => {});
  return audioCtxRef.current;
}

function playNotificationSound() {
  // "drop" is the default — a water droplet fits The Well's mythic register.
  // Users can override to "chime", "ping", "bell", or "none" via localStorage.
  const sound  = localStorage.getItem("well-notify-sound")  || "drop";
  const vol    = parseFloat(localStorage.getItem("well-notify-volume") || "0.5");
  if (sound === "none") return;
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    if (sound === "chime") {
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(freq, now + i * 0.18);
        g.gain.setValueAtTime(vol * 0.55, now + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now + i * 0.18); osc.stop(now + i * 0.18 + 0.5);
      });
    } else if (sound === "ping") {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(880, now);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.3);
    } else if (sound === "bubble") {
      // Underwater bubble pop — two quick pitch rises (small + larger bubble)
      [0, 0.09].forEach((delay, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(180 + i * 60, now + delay);
        o.frequency.exponentialRampToValueAtTime(520 + i * 120, now + delay + 0.07);
        g.gain.setValueAtTime(vol * (0.6 - i * 0.1), now + delay);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.09);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + delay); o.stop(now + delay + 0.1);
      });
    } else if (sound === "splash") {
      // Bigger splash — wide noise burst + low resonant thud
      const bufSize = Math.floor(ctx.sampleRate * 0.04);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      ns.buffer = buf; nf.type = "lowpass"; nf.frequency.value = 1800;
      ng.gain.setValueAtTime(vol * 0.5, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      ns.connect(nf); nf.connect(ng); ng.connect(ctx.destination);
      ns.start(now); ns.stop(now + 0.04);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(60, now + 0.18);
      g.gain.setValueAtTime(vol * 0.6, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.2);
    } else if (sound === "deep") {
      // Deep well resonance — low sine with slow decay, like a stone dropped far down
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(90, now);
      o.frequency.exponentialRampToValueAtTime(55, now + 0.6);
      g.gain.setValueAtTime(vol * 0.7, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      o.connect(g); g.connect(ctx.destination);
      o.start(now); o.stop(now + 0.7);
    } else if (sound === "ripple") {
      // Gentle ripple — three soft chimes rising like rings spreading on water
      [0, 0.12, 0.22].forEach((delay, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(660 + i * 220, now + delay);
        g.gain.setValueAtTime(vol * (0.35 - i * 0.07), now + delay);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.4);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + delay); o.stop(now + delay + 0.4);
      });
    } else if (sound === "bell") {
      [440, 880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(vol / (i + 1), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now); osc.stop(now + 1.1);
      });
    } else if (sound === "drop") {
      // Water droplet synthesis — three layers that together read as a real drop:
      //
      // 1. IMPACT NOISE (0–20ms): a short burst of bandpass-filtered white noise
      //    centered around 3kHz. This is the "splat" of water hitting water —
      //    pure sine waves don't have this texture and sound fake without it.
      //
      // 2. PITCH DIVE (0–120ms): sine wave starting at 1800Hz, falling steeply
      //    to 280Hz via exponential ramp. This is the characteristic "plink" of
      //    a drop — the frequency drop is what makes it read as water and not a bell.
      //
      // 3. BUBBLE RING (30–350ms): soft sine at 380Hz that fades slowly — the
      //    resonant ring of the water surface after impact, like ripples in sound.

      // Layer 1 — impact noise burst
      const bufSize  = Math.floor(ctx.sampleRate * 0.022);
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data     = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const noise      = ctx.createBufferSource();
      const noiseFilt  = ctx.createBiquadFilter();
      const noiseGain  = ctx.createGain();
      noise.buffer          = noiseBuf;
      noiseFilt.type        = "bandpass";
      noiseFilt.frequency.value = 3000;
      noiseFilt.Q.value     = 1.8;
      noiseGain.gain.setValueAtTime(vol * 0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      noise.connect(noiseFilt); noiseFilt.connect(noiseGain); noiseGain.connect(ctx.destination);
      noise.start(now); noise.stop(now + 0.022);

      // Layer 2 — pitch dive
      const dive     = ctx.createOscillator(), diveGain = ctx.createGain();
      dive.type = "sine";
      dive.frequency.setValueAtTime(1800, now);
      dive.frequency.exponentialRampToValueAtTime(280, now + 0.11);
      diveGain.gain.setValueAtTime(vol * 0.8, now);
      diveGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      dive.connect(diveGain); diveGain.connect(ctx.destination);
      dive.start(now); dive.stop(now + 0.13);

      // Layer 3 — bubble ring
      const ring     = ctx.createOscillator(), ringGain = ctx.createGain();
      ring.type = "sine";
      ring.frequency.setValueAtTime(380, now + 0.03);
      ringGain.gain.setValueAtTime(0, now);
      ringGain.gain.setValueAtTime(vol * 0.22, now + 0.03);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      ring.connect(ringGain); ringGain.connect(ctx.destination);
      ring.start(now + 0.03); ring.stop(now + 0.35);
    }
  } catch { /* audio unavailable */ }
}

// ── Markdown rendering (no external deps) ────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function applyInline(text) {
  return escHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, "<em>$1</em>");
}

function renderMarkdown(text) {
  text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${escHtml(code.trimEnd())}</code></pre>`);
  const lines = text.split("\n");
  const out = []; let inList = false, pendingBlank = false;
  for (const line of lines) {
    const hMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      if (inList) { out.push("</ul>"); inList = false; }
      pendingBlank = false;
      out.push(`<h${hMatch[1].length}>${applyInline(hMatch[2])}</h${hMatch[1].length}>`);
      continue;
    }
    const liMatch = line.match(/^[\-\*\+]\s+(.*)/);
    if (liMatch) {
      if (!inList) { out.push("<ul>"); inList = true; }
      pendingBlank = false;
      out.push(`<li>${applyInline(liMatch[1])}</li>`);
      continue;
    }
    if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      pendingBlank = true; continue;
    }
    pendingBlank = false;
    out.push(`<p>${applyInline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function stripMarkdown(text) {
  return text
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/gs, "$1")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\-\*\+]\s+/gm, "");
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, agentName }) {
  const contentRef = useRef(null);
  const isUser = msg.role === "user";
  const sender = isUser ? "You" : agentName;
  const emoji  = isUser ? "🌀" : "🔧";

  // Finalize: render markdown into the DOM element once (same atomic pattern)
  useEffect(() => {
    if (msg.finalized && contentRef.current && msg.content) {
      const el = contentRef.current;
      el.innerHTML = renderMarkdown(msg.content);
      el._rawMarkdown = msg.content;
      el.removeAttribute("aria-hidden");
      // Attach copy buttons to code blocks
      el.querySelectorAll("pre").forEach(pre => {
        if (pre.parentElement?.classList.contains("code-block")) return;
        const wrap = document.createElement("div");
        wrap.className = "code-block";
        pre.parentNode.insertBefore(wrap, pre);
        wrap.appendChild(pre);
        const btn = document.createElement("button");
        btn.className = "copy-btn";
        btn.textContent = "Copy";
        btn.setAttribute("aria-label", "Copy code to clipboard");
        btn.setAttribute("type", "button");
        btn.addEventListener("click", async () => {
          const code = pre.querySelector("code")?.textContent ?? pre.textContent;
          try {
            await navigator.clipboard.writeText(code);
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = "Copy"; }, 2000);
          } catch {
            btn.textContent = "Error";
            setTimeout(() => { btn.textContent = "Copy"; }, 2000);
          }
        });
        wrap.appendChild(btn);
      });
    }
  }, [msg.finalized, msg.content]);

  const handleCopy = async (fmt) => {
    const el = contentRef.current;
    const raw = el?._rawMarkdown || el?.textContent || msg.content || "";
    const toCopy = fmt === "text"
      ? stripMarkdown(raw).replace(/\n+/g, " ").trim()
      : raw;
    try { await navigator.clipboard.writeText(toCopy); } catch {}
  };

  const time = msg.time || "";

  return (
    <li className="message" data-role={msg.role}>
      <div className="msg-avatar" aria-hidden="true">{emoji}</div>
      <div className="msg-body">
        <div className="msg-header">
          <span className="msg-sender">{sender}</span>
          <time className="msg-time">{time}</time>
        </div>

        {/* Thumbnail for pasted images */}
        {msg.thumbDataUrl && (
          <img
            src={msg.thumbDataUrl}
            alt={msg.attachFilename || "Attached image"}
            className="attach-thumb"
          />
        )}

        {/* Content — aria-hidden during streaming (VoiceOver ignores mid-stream tokens) */}
        <div
          ref={contentRef}
          className="msg-content"
          aria-hidden={!msg.finalized ? "true" : undefined}
        >
          {!msg.finalized && !msg.content
            ? <span className="thinking" aria-hidden="true">…</span>
            : null}
        </div>

        {/* Copy dropdown */}
        <div className="msg-actions">
          <details className="copy-dropdown">
            <summary className="copy-dropdown-trigger" aria-label="Copy message options">Copy</summary>
            <ul className="copy-dropdown-menu" role="list">
              <li role="listitem">
                <button className="copy-opt" onClick={() => handleCopy("text")}>Copy as text</button>
              </li>
              <li role="listitem">
                <button className="copy-opt" onClick={() => handleCopy("markdown")}>Copy as markdown</button>
              </li>
            </ul>
          </details>
        </div>
      </div>
    </li>
  );
}

// ── Chat component ────────────────────────────────────────────────────────────
export default function Chat({ agents, activeAgentId, onAgentChange }) {
  const [messages, setMessages]     = useState([]);
  const [sessionId, setSessionId]   = useState(getOrCreateSessionId);
  const [streaming, setStreaming]    = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const srRef       = useRef(null);
  const abortRef    = useRef(null);
  const msgQueueRef = useRef([]);

  // Sent-message history for up-arrow recall
  const sentHistoryRef = useRef([]);
  const historyPosRef  = useRef(-1);
  const upPressRef     = useRef(0);
  const savedDraftRef  = useRef("");

  // Pending attachment
  const [attachment, setAttachment] = useState(null);

  const activeAgent = agents.find(a => a.agentId === activeAgentId) || agents[0];
  const agentName   = activeAgent?.displayName || "Sethren";

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const announce = (text) => {
    if (!srRef.current) return;
    srRef.current.textContent = "";
    setTimeout(() => { srRef.current.textContent = text; }, 50);
  };

  const scrollToBottom = () => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  };

  const formatTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // ── Add message to state ─────────────────────────────────────────────────────
  const addMessage = useCallback((role, initialContent = "", extras = {}) => {
    const id = crypto.randomUUID();
    const msg = {
      id, role,
      content: initialContent,
      finalized: role === "user",  // user messages are immediately finalized
      time: formatTime(),
      ...extras,
    };
    setMessages(prev => [...prev, msg]);
    return id;
  }, []);

  const updateMessage = useCallback((id, patch) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }, []);

  // ── Load history on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (historyLoaded) return;
    fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.messages?.length) return;
        const loaded = data.messages.map(m => ({
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content,
          finalized: true,
          time: "",
        }));
        setMessages(loaded);
        setTimeout(scrollToBottom, 50);
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [sessionId, historyLoaded]);

  // ── Scroll to bottom on new messages ────────────────────────────────────────
  useEffect(() => { scrollToBottom(); }, [messages]);

  // ── Image paste ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            const mimeFromUrl = dataUrl.split(";")[0].split(":")[1] || item.type || "image/png";
            const ext = mimeFromUrl.split("/")[1] || "png";
            setAttachment({ dataUrl, mimeType: mimeFromUrl, filename: file.name || `image.${ext}` });
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, []);

  // ── Focus input on any printable keypress ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target === inputRef.current) return;
      const tag = e.target.tagName;
      if (["BUTTON","TEXTAREA","SELECT","INPUT"].includes(tag)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" || e.key.length > 1) return;
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  // ── Up/down arrow history recall ─────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
      return;
    }
    if (e.key === "ArrowUp") {
      const atStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0;
      if (atStart) {
        upPressRef.current++;
        if (upPressRef.current >= 2 && sentHistoryRef.current.length > 0) {
          e.preventDefault();
          if (historyPosRef.current === -1) {
            savedDraftRef.current = e.target.value;
            historyPosRef.current = sentHistoryRef.current.length - 1;
          } else if (historyPosRef.current > 0) {
            historyPosRef.current--;
          }
          e.target.value = sentHistoryRef.current[historyPosRef.current];
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
          e.target.setSelectionRange(0, 0);
        }
      } else { upPressRef.current = 0; }
      return;
    }
    if (e.key === "ArrowDown" && historyPosRef.current !== -1) {
      e.preventDefault();
      if (historyPosRef.current < sentHistoryRef.current.length - 1) {
        historyPosRef.current++;
        e.target.value = sentHistoryRef.current[historyPosRef.current];
      } else {
        historyPosRef.current = -1;
        e.target.value = savedDraftRef.current;
      }
      e.target.style.height = "auto";
      e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
      return;
    }
    if (!["Shift","Control","Meta","Alt","CapsLock"].includes(e.key)) {
      upPressRef.current = 0;
      if (historyPosRef.current !== -1) { historyPosRef.current = -1; savedDraftRef.current = ""; }
    }
  };

  // ── Stop ─────────────────────────────────────────────────────────────────────
  const stopStream = () => { if (abortRef.current) abortRef.current.abort(); };

  // ── Clear ────────────────────────────────────────────────────────────────────
  const clearHistory = async () => {
    if (streaming) return;
    await fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => {});
    const newId = resetSessionId();
    setSessionId(newId);
    setMessages([]);
    setHistoryLoaded(true);
  };

  // ── Send ─────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const el = inputRef.current;
    const text = el.value.trim();
    const att  = attachment;
    if (!text && !att) return;

    el.value = "";
    el.style.height = "auto";
    setAttachment(null);

    if (streaming) {
      const qText = text || "[image]";
      msgQueueRef.current.push(qText);
      addMessage("user", `[queued] ${qText}${att ? " + image" : ""}`);
      announce(`Queued: ${qText}`);
      return;
    }

    await doSend(text, att);
  };

  const doSend = async (text, att = null) => {
    let agentMessage = text;
    let thumbDataUrl = null;

    // Upload attachment
    if (att) {
      try {
        const up = await fetch("/api/attach-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: att.dataUrl, mimeType: att.mimeType, filename: att.filename }),
        });
        if (up.ok) {
          const { path } = await up.json();
          agentMessage = (text ? text + "\n" : "") + `[image: ${path}]`;
          thumbDataUrl = att.dataUrl;
        } else {
          const errBody = await up.text().catch(() => "(unreadable)");
          agentMessage = (text ? text + "\n" : "") + `[Image paste: upload failed (HTTP ${up.status}) — ${errBody.slice(0, 120)}]`;
        }
      } catch (err) {
        agentMessage = (text ? text + "\n" : "") + `[Image paste: network error — ${err.message}]`;
      }
    }

    if (!agentMessage.trim()) return;

    sentHistoryRef.current.push(text || "[image]");
    historyPosRef.current = -1;
    savedDraftRef.current = "";

    // User bubble
    addMessage("user", text || "", {
      thumbDataUrl,
      attachFilename: att?.filename,
    });
    announce(`You: ${text || "[image]"}`);

    // Assistant bubble — aria-hidden until finalized
    const assistId = addMessage("assistant", "", { finalized: false });

    setStreaming(true);
    abortRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: agentMessage, sessionId, agentId: activeAgentId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        updateMessage(assistId, { content: `Error: ${err.error || response.statusText}`, finalized: true, error: true });
        return;
      }

      // Stream — accumulate in JS buffer, never write to DOM mid-stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", streamBuf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          try {
            const event = JSON.parse(raw);
            if (event.delta) {
              streamBuf += event.delta;
              // No DOM write — React state not updated mid-stream
            } else if (event.done || event.error) {
              // Finalize: set content once, React re-renders, useEffect does the markdown render
              updateMessage(assistId, { content: streamBuf, finalized: true });
              announce(`${agentName}: ${stripMarkdown(streamBuf).replace(/\n+/g, " ").trim()}`);
              playNotificationSound();
              streamBuf = "";
            }
          } catch { /* malformed chunk */ }
        }
      }

      // Safety: finalize if done event didn't fire
      if (streamBuf) {
        updateMessage(assistId, { content: streamBuf, finalized: true });
        announce(`${agentName}: ${stripMarkdown(streamBuf).replace(/\n+/g, " ").trim()}`);
        playNotificationSound();
      }

    } catch (err) {
      if (err.name === "AbortError") {
        setMessages(prev => {
          const m = prev.find(m => m.id === assistId);
          const stopped = m?.content?.trim();
          return prev.map(m =>
            m.id === assistId
              ? { ...m, content: stopped || "[stopped]", finalized: true }
              : m
          );
        });
        announce("Response stopped.");
      } else {
        updateMessage(assistId, { content: `Network error: ${err.message}`, finalized: true, error: true });
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      inputRef.current?.focus();
      // Process queued messages
      if (msgQueueRef.current.length > 0) {
        const next = msgQueueRef.current.shift();
        await doSend(next);
      }
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <section className="chat-section" aria-label="Conversation with the Well">
      {/* Screen reader announcement region */}
      <div ref={srRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Message list */}
      <ol
        ref={listRef}
        id="message-list"
        role="log"
        aria-label="Conversation"
        aria-live="off"
        aria-relevant="additions"
      >
        {isEmpty && (
          <li id="empty-state" aria-live="off">
            <div className="glyph" aria-hidden="true">𐰘</div>
            <p>The Well is quiet. Say something to begin.</p>
          </li>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} agentName={agentName} />
        ))}
      </ol>

      {/* Input area */}
      <section id="input-area" aria-label="Message input">
        {attachment && (
          <div id="attachment-preview" role="status">
            <span className="attach-label" aria-hidden="true">📎</span>
            <span className="attach-name">{attachment.filename}</span>
            <button
              type="button"
              className="attach-remove"
              aria-label="Remove attached image"
              onClick={() => setAttachment(null)}
            >✕</button>
          </div>
        )}

        <form id="input-form" noValidate onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
          <textarea
            ref={inputRef}
            id="message-input"
            rows={1}
            placeholder={`Talk to ${agentName}…`}
            aria-label="Message"
            aria-multiline="true"
            autoComplete="off"
            spellCheck="true"
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" id="send-btn" aria-label="Send message" disabled={streaming && !attachment}>
            ↑
          </button>
          {streaming && (
            <button type="button" id="stop-btn" aria-label="Stop response" onClick={stopStream}>
              ■
            </button>
          )}
        </form>

        <div id="input-hint" aria-live="off">
          Enter to send · Shift+Enter for new line ·{" "}
          <button id="clear-btn" type="button" onClick={clearHistory}>
            Clear history
          </button>
        </div>
      </section>
    </section>
  );
}
