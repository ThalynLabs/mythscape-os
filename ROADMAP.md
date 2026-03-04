# Urðarbrunnr — The Well — Roadmap

Last updated: 2026-03-01

---

## In Progress / Next

### Copy dropdown on messages
- "Copy formatted" — plain text, markdown stripped
- "Copy as markdown" — raw markdown source
- Same pattern as Mythscape MessageItem
- Keyboard accessible (dropdown trigger + menu items)

### Keyboard shortcuts — any key focuses input
- Pressing any printable key while NOT in the input → focus input + type that character
- Exception: `/` key passes through (reserved for OpenClaw commands)
- Exception: modifier key combos (Ctrl, Cmd, Alt) pass through
- Exception: arrow/function keys pass through

### Up-arrow history recall (smart)
- Pressing ↑ normally navigates to top of typed text — leave that alone
- Only trigger history recall on SECOND ↑ press when cursor is already at position 0
- First ↑ from position 0 sets a "ready" flag; second ↑ replaces input with last sent message
- Any other keypress clears the flag (prevents accidental triggers)
- ↓ goes forward in history if navigating

### Settings + config → GUI
**Priority feature.** No more JSON editing. Every config gets a labeled form field.
Scope:
- Notification sound picker + volume slider (partially done)
- Agent display names
- Agent model selection (which gateway agent each name maps to)
- Gateway URL
- Notification behavior (sound on/off, which events trigger)
- Chat history window size
- Keyboard shortcut customization (future)
Map all of `settings.json` to a web form. Save writes back to `/opt/openclaw-voice/settings.json` via daemon API.

---

## Queued (do after above)

### Paste image / document into chat (multimodal)
- Listen for `paste` event on input — detect if clipboard has image data
- Extract as base64, show inline preview (with alt text input for accessibility)
- On send: include image as content part alongside text message
- Daemon passes to gateway as OpenAI vision format: `content: [{type:"image_url", ...}, {type:"text", ...}]`
- Claude (main agent) handles vision natively
- Also handle drag-and-drop onto chat area
- Document paste (PDF/text): extract text content, send as quoted text block
- Need to verify OpenClaw gateway forwards multimodal content parts correctly

### Focus jump after response
- When chime fires + response lands, VoiceOver should be able to jump to the new message quickly
- Keyboard shortcut (e.g., `End` or custom) to jump to latest message
- Or: auto-move focus to new message element (carefully — don't yank focus while typing)

### Message navigation shortcuts
- Quick-step through conversation without VO-arrowing through every element
- Something like `PageUp`/`PageDown` or custom to jump message-by-message

### Persist history across daemon restarts
- Right now session clears on daemon restart
- Write session history to a JSON file on disk (per-session-id)
- Load on startup — conversation survives restarts and Mac reboots

---

## Decided Against (for now)

### Regenerate / "try again"
- Nature of the chats doesn't call for it
- Time better spent on settings GUI

---

## Phase 2 (Voice — separate)

- Wake word detection (openWakeWord + pyaudio)
- ElevenLabs TTS response (speak the reply)
- Voice input → text via Whisper

---

## Phase 3 (History + Memory)

- Chat history summarization (summary + sliding window hybrid)
- Cross-session memory (vector retrieval of past conversations)
- Export conversation to Mythscape / notebook
