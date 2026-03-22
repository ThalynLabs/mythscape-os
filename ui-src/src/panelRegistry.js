/**
 * panelRegistry.js — The spine of The Well
 *
 * All sidebar sections are registered here. Nothing in the sidebar is hardcoded.
 * Core panels register at build time. Skill-contributed panels register at runtime.
 *
 * Categories:
 *   infrastructure — what keeps the tree alive
 *   process        — work being done, active weaving
 *   capability     — what the agent can do
 *   realm          — where the agent reaches
 */

// The registry: panel id → panel definition.
// A Map (not an array) so skill-contributed panels can register and replace by id
// without duplicating or requiring a full re-render of the sidebar.
const _registry = new Map();

// ── Pin persistence ───────────────────────────────────────────────────────────
// Pins are stored in localStorage so they survive page refreshes.
// Each pin is { type: "panel", id: string } or { type: "trace", traceId, label }.
// Pinned panels render as summary cards on The Well's landing page,
// giving quick access to whatever the user cares about most right now.
const PINS_KEY = "well-pins";

function loadPins() {
  // Returns current pin array from localStorage, or empty array if nothing stored/corrupt.
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || "[]"); }
  catch { return []; }
}

function savePins(pins) {
  // Writes pin array back to localStorage. Silent fail — pin state is convenience, not critical.
  try { localStorage.setItem(PINS_KEY, JSON.stringify(pins)); }
  catch {}
}

// ── Registry API ──────────────────────────────────────────────────────────────

// ── Registry API ──────────────────────────────────────────────────────────────
// This is the single source of truth for what sections exist in The Well.
// The sidebar, command palette, and pin system all read from here —
// nothing renders a nav item by hardcoding it in JSX.
export const panelRegistry = {

  /**
   * Register a panel. Core panels call this at module load time.
   * Skills call this at runtime when they load — no shell code changes needed.
   * If a panel with the same id is registered twice, the second registration wins
   * (allows skills to override or extend core panels in future).
   */
  register(panel) {
    if (!panel.id || !panel.label || !panel.category) {
      console.warn("[panelRegistry] Skipping invalid panel — missing id, label, or category:", panel);
      return;
    }
    _registry.set(panel.id, panel);
  },

  /** Get a single panel definition by id. Used when rendering a specific section. */
  get(id) { return _registry.get(id) || null; },

  /** All registered panels as an array, regardless of visibility. Used by search. */
  all() { return Array.from(_registry.values()); },

  /**
   * Panels that appear in the sidebar.
   * Filters out: hidden panels (defaultVisible: false) and nested panels (nestedUnder set).
   * Nested panels appear inside their parent section as <details> blocks, not in the sidebar.
   * Sorted by the `order` field within each category.
   */
  sidebar() {
    return this.all()
      .filter(p => p.defaultVisible !== false && !p.nestedUnder)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  },

  /**
   * Sidebar panels grouped by category, in the canonical category order.
   * Category order (infrastructure → process → capability → realm) reflects
   * the mental model: system health first, then active work, then tools, then connections.
   * Used by the sidebar to render <h2>-headed groups.
   */
  grouped() {
    const order = ["infrastructure", "process", "capability", "realm"];
    const groups = {};
    for (const cat of order) groups[cat] = [];
    for (const p of this.sidebar()) {
      if (groups[p.category]) groups[p.category].push(p);
    }
    return groups;
  },

  /**
   * Search all registered panels — including hidden ones — by label, description, and tags.
   * This powers the command palette (⌘K): even panels not shown in the sidebar
   * are reachable by search. A user who installs 30 skills with panels doesn't get
   * a cluttered sidebar; they get a searchable registry.
   */
  search(query) {
    if (!query?.trim()) return [];
    const q = query.toLowerCase();
    return this.all().filter(p =>
      p.label.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    );
  },

  // ── Pin system ──────────────────────────────────────────────────────────────
  // Pins are how the user customizes The Well's landing page.
  // Any panel (or pipeline trace) can be pinned; pinned items render as
  // summary cards on The Well section above the chat.
  // This is the "no clutter on landing" solution: the sidebar stays clean,
  // but important things are one click from home.

  /** Returns the current pin array from localStorage. */
  getPins() { return loadPins(); },

  /** True if the panel with this id is currently pinned to The Well. */
  isPinned(id) { return loadPins().some(p => p.id === id && p.type === "panel"); },

  /** Add a panel pin. Idempotent — pinning something already pinned is a no-op. */
  pin(id) {
    const pins = loadPins();
    if (!pins.some(p => p.id === id && p.type === "panel")) {
      savePins([...pins, { type: "panel", id }]);
    }
  },

  /** Remove a panel pin. */
  unpin(id) {
    savePins(loadPins().filter(p => !(p.type === "panel" && p.id === id)));
  },

  /** Toggle pin state for a panel. Used by the pin button in each section header. */
  togglePin(id) {
    this.isPinned(id) ? this.unpin(id) : this.pin(id);
  },
};

// ── Core panel definitions ────────────────────────────────────────────────────
// Components are lazy imports — filled in as each section is built.
// Placeholder: null (renders "being carved" message)

const CORE_PANELS = [
  // ── Infrastructure ──────────────────────────────────────────────────────────
  {
    id: "well",
    label: "The Well",
    icon: "◉",
    category: "infrastructure",
    order: 0,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["home", "gateway", "status", "health", "chat"],
    description: "The heart of your OpenClaw instance — the Gateway that draws all channels together and keeps the World Tree alive.",
  },
  {
    id: "hearth",
    label: "The Hearth",
    icon: "△",
    category: "infrastructure",
    order: 1,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["security", "doctor", "audit", "health", "sandbox", "zion", "atropos"],
    description: "Warmth and protection. Atropos holds the shears here. Doctor checks, security audits, approval gates.",
  },
  {
    id: "norns",
    label: "The Norns",
    icon: "△",
    category: "infrastructure",
    order: 2,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["agents", "memory", "cron", "heartbeat", "sessions", "urd", "verdandi", "skuld", "identity", "soul", "schedule"],
    description: "Three sisters tend the tree. Urd holds what has passed. Verdandi holds what is now. Skuld holds what is yet to be.",
  },
  {
    id: "runes",
    label: "The Runes",
    icon: "◇",
    category: "infrastructure",
    order: 3,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["config", "model", "settings", "soul", "agents", "user", "auth", "secrets", "zeus", "lachesis"],
    description: "Carved configurations — model selection, identity files, security policies. The runes shape how the Well speaks.",
  },

  // ── Process ─────────────────────────────────────────────────────────────────
  {
    id: "skein",
    label: "The Skein",
    icon: "⊘",
    category: "process",
    order: -1,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["skein", "archive", "history", "messages", "search", "conversation"],
    description: "The woven record — every message that has passed through the Well, archived and searchable.",
  },
  {
    id: "threads",
    label: "The Threads",
    icon: "≡",
    category: "process",
    order: 0,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["sessions", "conversations", "active", "sandbox", "history", "hermes", "clotho"],
    description: "Active conversations are threads being woven. Each session is a thread in the loom.",
  },
  {
    id: "moirai",
    label: "The Moirai",
    icon: "⟁",
    category: "process",
    order: 1,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["pipeline", "approvals", "zion", "hermes", "zeus", "atropos", "clotho", "lachesis", "decisions", "traces"],
    description: "The Greek Fates tend the pipeline. Atropos holds what must be approved. Clotho spins what is being wired. Lachesis measures what has been shaped.",
  },

  // ── Capability ───────────────────────────────────────────────────────────────
  {
    id: "branches",
    label: "The Branches",
    icon: "⊕",
    category: "capability",
    order: 0,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["skills", "plugins", "clawhub", "install", "bundled", "managed", "workspace"],
    description: "Skills reach like branches into every realm of capability. Add, remove, search what grows from the tree.",
  },
  {
    id: "voice",
    label: "The Galdr",
    icon: "◎",
    category: "capability",
    order: 1,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["voice", "tts", "elevenlabs", "wake", "wakeword", "talk", "speech", "audio"],
    description: "Galdr — the Old Norse art of spoken incantation. How the Well speaks intn summoned. Wake word, Talk Mode, voice profiles, and the tongue of the tree.",
  },
  {
    id: "nodes",
    label: "The Nodes",
    icon: "⬡",
    category: "capability",
    order: 2,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["nodes", "devices", "iphone", "android", "mac", "companion", "camera", "screen"],
    description: "The branches of the tree reach into distant realms. Companion devices are those far extensions.",
  },

  // ── Realm ────────────────────────────────────────────────────────────────────
  {
    id: "roots",
    label: "The Roots",
    icon: "⌥",
    category: "realm",
    order: 0,
    defaultVisible: true,
    defaultPinned: false,
    source: "core",
    tags: ["channels", "whatsapp", "telegram", "discord", "slack", "signal", "pairing", "midgard", "alfheim", "asgard", "vanaheim", "niflheim"],
    description: "Nine realms, each reached by a different root of the World Tree. These are the channels through which voices reach you.",
  },
];

// Register all core panels
for (const panel of CORE_PANELS) {
  panelRegistry.register(panel);
}
