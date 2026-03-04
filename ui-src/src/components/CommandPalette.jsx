/**
 * CommandPalette.jsx — ⌘K command palette for Urðarbrunnr
 *
 * PATTERN: focus-management-on-route-change
 * CONTEXT: Global command palette, Well of Urd
 * ELEMENT: <dialog> (native modal, VoiceOver reads "dialog" landmark)
 * WHY: Native <dialog> with showModal() gives us free focus trapping, Escape-to-close,
 *      and backdrop click dismissal without ARIA. VoiceOver announces "Web dialog" and
 *      moves focus inside automatically. Adding role="dialog" would double-announce.
 * VOICEOVER READS: "Web dialog" on open; focus lands on search input immediately.
 * REUSE: any modal that needs full focus trapping without custom ARIA.
 * SEE ALSO: disclosure-without-aria, search-landmark-native
 *
 * Sources: panel registry (navigation targets) + a small set of built-in actions
 * (refresh, toggle sound, open settings). Extensible — skills can register commands
 * by adding to the panel registry with searchable: true.
 *
 * Keyboard:
 *   ⌘K / Ctrl+K — open
 *   Escape       — close
 *   ArrowUp/Down — navigate results
 *   Enter        — execute highlighted result
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { panelRegistry } from "../panelRegistry.js";

// ── Built-in actions (non-panel commands) ─────────────────────────────────────
// These supplement the panel registry with actions that don't navigate to a section.
// Keep this list short — the palette is for navigation first.
const BUILTIN_ACTIONS = [
  {
    id:   "action:refresh",
    name: "Refresh",
    desc: "Reload health and session data",
    icon: "↻",
    kind: "action",
  },
  {
    id:   "action:sound-toggle",
    name: "Toggle sound",
    desc: "Mute or unmute notification sounds",
    icon: "🔔",
    kind: "action",
  },
];

// ── Fuzzy match ───────────────────────────────────────────────────────────────
// Simple substring match, case-insensitive. Checks name then description.
// Guard against undefined — panel registry uses .label, builtins use .name.
function matches(query, item) {
  if (!query) return true;
  const q    = query.toLowerCase();
  const name = (item.name || item.label || "").toLowerCase();
  const desc = (item.desc || item.description || "").toLowerCase();
  return name.includes(q) || desc.includes(q);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CommandPalette({ onNavigate, onAction, isOpen, onClose }) {
  const [query,     setQuery]     = useState("");
  const [selected,  setSelected]  = useState(0);
  const dialogRef   = useRef(null);
  const inputRef    = useRef(null);

  // Build command list from panel registry + built-ins every render.
  // Panel registry is synchronous and small — no memoisation needed.
  // Panel registry uses `label` not `name` — normalise to `name` here so the
  // rest of the palette code has a consistent field to work with.
  const panels   = panelRegistry.all()
    .filter(p => p.searchable !== false)
    .map(p => ({
      id:      `panel:${p.id}`,
      name:    p.label || p.name || p.id,
      desc:    p.description,
      icon:    p.icon,
      kind:    "panel",
      panelId: p.id,
    }));

  const allCommands = [...panels, ...BUILTIN_ACTIONS];
  const results     = allCommands.filter(c => matches(query, c));

  // Reset selection when query changes so the first result is always selected.
  useEffect(() => { setSelected(0); }, [query]);

  // Open/close the native <dialog> in sync with the isOpen prop.
  // showModal() gives free focus trapping, Escape handling, and backdrop.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
      // Clear query so every open starts fresh
      setQuery("");
      setSelected(0);
      // Focus the search input so VoiceOver announces it immediately
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  // Listen for <dialog>'s native close event (e.g., Escape key)
  // and propagate it to the parent so isOpen stays in sync.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  // Global ⌘K / Ctrl+K shortcut — let App.jsx own this so it can toggle.
  // CommandPalette only handles internal keyboard nav.

  const execute = useCallback((item) => {
    if (!item) return;
    onClose();
    if (item.kind === "panel")  onNavigate(item.panelId);
    if (item.kind === "action") onAction?.(item.id);
  }, [onClose, onNavigate, onAction]);

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(results[selected]);
    }
    // Escape is handled natively by <dialog> — no need to intercept here.
  }

  return (
    /*
     * PATTERN: disclosure-without-aria
     * Native <dialog> provides role="dialog" implicitly; no extra ARIA needed.
     * The ::backdrop pseudo-element dims the background for sighted users.
     */
    <dialog
      ref={dialogRef}
      className="command-palette"
      aria-label="Command palette — type to navigate or search"
      onClick={e => { if (e.target === dialogRef.current) onClose(); }}
    >
      {/* PATTERN: search-landmark-native — <search> element, no ARIA required */}
      <search>
        <label htmlFor="palette-input" className="sr-only">
          Search panels and commands
        </label>
        <input
          ref={inputRef}
          id="palette-input"
          className="palette-input"
          type="search"
          placeholder="Go to… or type a command"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
        />
      </search>

      {results.length === 0 ? (
        <p className="palette-empty">No matching panels or commands.</p>
      ) : (
        /*
         * PATTERN: navigation-landmark-via-nav
         * Results list is an <ol> — VoiceOver announces "list, N items" so the
         * user knows how many results exist before navigating into them.
         */
        <ol
          className="palette-results"
          role="listbox"
          aria-label="Results"
        >
          {results.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === selected}
              className={`palette-result${i === selected ? " palette-result--selected" : ""}`}
              onClick={() => execute(item)}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="palette-icon" aria-hidden="true">{item.icon}</span>
              <span className="palette-name">{item.name}</span>
              {(item.desc || item.description) && (
                <span className="palette-desc">{item.desc || item.description}</span>
              )}
              <span className="palette-kind" aria-hidden="true">
                {item.kind === "panel" ? "section" : "action"}
              </span>
            </li>
          ))}
        </ol>
      )}

      <footer className="palette-footer" aria-hidden="true">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>Esc close</span>
      </footer>
    </dialog>
  );
}
