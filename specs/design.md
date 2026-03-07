---
type: design
project: wa-claude
date: 2026-02-14
---
# [[wa-claude-home|WA Claude]] — Design
*[[dev-hub|Hub]]*

> Living document: what we're building and why.
> Update when scope changes, architecture evolves, or constraints are discovered.

---

## Purpose

A native Windows Node.js daemon that bridges WhatsApp to live Claude Code TUI sessions via pseudo-terminals. The problem: mobile access to Claude Code is currently limited to SSH via Termux, which is unstable and clunky. wa-claude turns WhatsApp into a lightweight, reliable terminal relay — one WhatsApp Group per project, each routing to its own persistent Claude Code session. This enables fully interactive Claude Code work from a phone with zero setup on the mobile side.

---

## Current Scope

> Features actively being built or maintained. If it's not here, it's not in scope.

- **WhatsApp Bridge**: Connect to WhatsApp via `whatsapp-web.js`, authenticate once via QR code, maintain persistent session. Single-user only (sender verification against whitelisted number).

- **PTY Session Management**: Spawn and manage multiple concurrent PowerShell PTY sessions via `node-pty`. Each session: `cd` to project directory → launch `claude`. Track session state (claude-active vs shell-exited). Auto-restart Claude Code or lock session if TUI exits unexpectedly.

- **Group-Based Routing**: Each WhatsApp Group maps to one PTY session. Group name determines project directory (configurable mapping). Messages in a group route to the corresponding PTY. Output from each PTY routes back to its group.

- **Control Channel (DM)**: Direct messages to the bot handle meta-commands:
  - `/list` — show active sessions with status
  - `/open <project-name>` — create a new group + PTY session (or attach to existing group)
  - `/kill <project-name>` — terminate a PTY session
  - `/restart <project-name>` — kill and relaunch Claude Code in a session
  - `/status` — system health (uptime, memory, active PTYs)

- **Smart Output Processing**: Clean ANSI escape codes from PTY output. Buffer rapid output (2-second silence threshold before sending). Intelligent summarization by default:
  - File changes: `✓ Modified: src/app.py` (not the full diff)
  - Approval prompts: relay verbatim (these need user action)
  - Claude Code reasoning: summarize to key points + conclusion
  - Errors: relay verbatim (critical for debugging)
  - Code blocks: truncate with line count, e.g., `[47 lines of Python — /full to see]`
  - `/full` command in any group: resend last output untruncated

- **Security Boundary**: WhatsApp messages only reach the Claude Code TUI, never a raw shell. If Claude Code exits, the orchestrator catches this and either restarts or locks — it does not leave a naked PowerShell exposed. Sender verification on every message (whitelist single phone number).

---

## Architecture

> How components fit together.

```
WhatsApp (phone)
    │
    ▼
┌─────────────────────────────────────────────────┐
│  wa-claude daemon (Node.js, native Windows)     │
│                                                 │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │  wa-bridge    │────▶│  command-router      │  │
│  │  (whatsapp-   │     │  - DM → meta cmds    │  │
│  │   web.js)     │     │  - Group → PTY route  │  │
│  └──────────────┘     └──────────┬───────────┘  │
│                                  │               │
│                    ┌─────────────▼────────────┐  │
│                    │  session-manager          │  │
│                    │  - spawn/kill PTYs        │  │
│                    │  - track state per group  │  │
│                    │  - group↔project mapping  │  │
│                    └─────────────┬────────────┘  │
│                                  │               │
│              ┌───────────────────┼────────┐      │
│              ▼                   ▼        ▼      │
│         ┌─────────┐      ┌─────────┐  ┌─────┐   │
│         │ PTY #1  │      │ PTY #2  │  │ ... │   │
│         │ PS → CC │      │ PS → CC │  │     │   │
│         │ tweet-db│      │ scholia │  │     │   │
│         └────┬────┘      └────┬────┘  └──┬──┘   │
│              │                │           │      │
│              ▼                ▼           ▼      │
│         ┌──────────────────────────────────┐     │
│         │  output-processor                │     │
│         │  - strip ANSI                    │     │
│         │  - buffer (2s silence threshold) │     │
│         │  - summarize / truncate          │     │
│         │  - detect approval prompts       │     │
│         └──────────────┬───────────────────┘     │
│                        │                         │
│                        ▼                         │
│                   wa-bridge                      │
│                   (send to correct group)        │
└─────────────────────────────────────────────────┘
```

**Key files:**

```
C:\Users\dev\wa-claude\
├── server.js               # Entry point, PM2 managed
├── src\
│   ├── wa-bridge.js        # whatsapp-web.js connection + message send/receive
│   ├── command-router.js   # Parse incoming msgs, route DM vs group
│   ├── session-manager.js  # PTY lifecycle (spawn, kill, restart, state tracking)
│   ├── pty-wrapper.js      # node-pty abstraction, stdin/stdout handling
│   ├── output-processor.js # ANSI strip, buffer, summarize, format for WA
│   └── config.js           # Project mappings, whitelist, thresholds
├── .wwebjs_auth\           # WhatsApp session persistence (auto-created)
├── package.json
└── README.md
```

**Data flow:**

1. WhatsApp message arrives → `wa-bridge.js` receives it
2. `command-router.js` checks: DM or Group? If DM, parse as meta-command. If Group, look up which PTY session this group maps to.
3. For group messages: `session-manager.js` writes the message text + `\r` (Enter) to the PTY's stdin via `pty-wrapper.js`
4. PTY stdout fires `onData` → `output-processor.js` buffers chunks, waits for 2s silence, then processes
5. Processed output sent back to the originating WhatsApp Group via `wa-bridge.js`

**Session state machine:**

```
INIT → (cd + claude launch) → CLAUDE_ACTIVE
CLAUDE_ACTIVE → (user messages relay to TUI) → CLAUDE_ACTIVE
CLAUDE_ACTIVE → (claude exits) → SESSION_LOCKED
SESSION_LOCKED → (/restart or auto-restart) → INIT
SESSION_LOCKED → (any user message) → "Session locked. Use /restart"
```

---

## Configuration

```javascript
// config.js
module.exports = {
  // Your WhatsApp number (only sender allowed)
  allowedNumber: '1234567890@c.us',

  // Project directory root
  projectRoot: 'C:\\Users\\dev',

  // Group name → project directory mapping
  // Group "tweet-db" → C:\Users\dev\tweet-db
  // Can override for non-standard paths:
  projectOverrides: {
    'scholia': 'C:\\Users\\dev\\reader3',
  },

  // Output processing
  output: {
    bufferSilenceMs: 2000,        // Wait this long after last output before sending
    maxMessageLength: 4000,       // Split messages beyond this
    summarizeThreshold: 1500,     // Summarize output longer than this (chars)
  },

  // PTY settings
  pty: {
    shell: 'powershell.exe',
    cols: 120,
    rows: 40,
  }
};
```

---

## Constraints

- **Technical**: Native Windows Node.js (not WSL). Claude Code is installed on Windows side. Projects live under `C:\Users\dev\`. Node.js 18+ required for `node-pty` compatibility.

- **Workflow**: WhatsApp is the sole interface — no web dashboard, no secondary UI. All interaction happens through WhatsApp messages. The bot never exposes a raw shell to WhatsApp input.

- **Scope**: Single user only. No authentication beyond sender number verification. No encryption of local state beyond what WhatsApp provides. No cloud components — everything runs on the desktop.

- **Dependencies**: `whatsapp-web.js` is unofficial and can break when WhatsApp updates their web client. This is a known fragility — the alternative (official Cloud API) requires Meta Business account setup and is overkill for single-user personal use.

- **WhatsApp Limits**: Messages should stay under ~4000 chars for reliable delivery. Rate limiting: don't send more than ~20 messages per minute to avoid temporary blocks. Multi-line input from WhatsApp arrives as a single string (newlines preserved).

---

## Output Summarization Rules

The output processor applies these rules in order:

1. **Approval prompts** — detect patterns like `Do you want to...`, `Allow...`, `y/n`, `(Y/n)` → relay verbatim, prepend with 🔵 emoji

2. **Error output** — detect stderr, stack traces, error keywords → relay verbatim, prepend with 🔴 emoji

3. **File change notifications** — detect `Created:`, `Modified:`, `Deleted:`, diff headers → compress to one-line summaries: `✓ Modified: src/app.py (+12 -3)`

4. **Code blocks** — detect fenced code or indented blocks > 10 lines → truncate to first 5 lines + `[... 42 more lines — reply /full to see]`

5. **Claude Code reasoning** — everything else (explanations, analysis) → if under `summarizeThreshold`, relay as-is. If over, keep first paragraph + last paragraph + `[... truncated — reply /full to see]`

6. **All output** — strip ANSI escape codes, normalize whitespace, split into multiple messages if over `maxMessageLength`

The `/full` command in any group resends the last raw (ANSI-stripped but unsummarized) output.

---

## Future Ideas

> Captured for later. Not in current scope — don't implement without updating this doc.

- [ ] `/brief` and `/verbose` toggle per session — switch between heavy summarization and passthrough
- [ ] Smart multi-line input — convention like `>>>` to start multi-line, `<<<` to end and send as one block
- [ ] Session persistence across daemon restarts — serialize PTY state or at minimum log the last N exchanges so context isn't lost
- [ ] Webhook mode — alternative to `whatsapp-web.js` using official WhatsApp Cloud API for stability (requires Meta Business account)
- [ ] Output-to-file — `/save` command that dumps full session transcript to a file on desktop
- [ ] Notification batching — for long-running Claude Code tasks, batch intermediate output into periodic summaries instead of streaming
- [ ] Voice message input — WhatsApp voice notes → Whisper transcription → PTY input
- [ ] Image relay — screenshots or images from Claude Code output → sent as WhatsApp images
- [ ] Mobile-initiated git operations — `/commit`, `/push`, `/status` shortcuts that bypass Claude Code
- [ ] Rate limit protection — automatic slowdown if approaching WhatsApp message limits
- [ ] Group auto-creation — `/open tweet-db` automatically creates the WhatsApp Group (currently manual)

---

## Implementation Notes

### Dependencies

```json
{
  "dependencies": {
    "whatsapp-web.js": "^1.26.0",
    "node-pty": "^1.0.0",
    "strip-ansi": "^7.1.0",
    "qrcode-terminal": "^0.12.0"
  },
  "devDependencies": {
    "pm2": "^5.3.0"
  }
}
```

### First-Run Setup

1. `npm install` in project directory
2. `node server.js` — displays QR code in terminal
3. Scan QR code with WhatsApp on phone
4. Session persists in `.wwebjs_auth/` — no re-scan needed unless revoked
5. Create WhatsApp Groups manually, add bot contact, name them to match project directories
6. `pm2 start server.js --name wa-claude` for persistent daemon
7. `pm2 startup` to survive reboots

### Testing Strategy

1. **Unit**: Output processor (ANSI stripping, summarization rules) — testable without WhatsApp connection
2. **Integration**: PTY spawn + message routing — mock WhatsApp, test with real PowerShell sessions
3. **E2E**: Send actual WhatsApp messages, verify Claude Code interaction. Start with a single group, confirm round-trip works before adding concurrency.

### Known Risks

- `whatsapp-web.js` breakage: WhatsApp periodically updates their web client. The library usually catches up within days, but there can be gaps. Mitigation: pin version, test before updating.
- `node-pty` on Windows: Generally stable but can have issues with certain PowerShell configurations. Test with the exact PowerShell version on the target machine.
- Claude Code auth expiry: If the stored token expires, Claude Code will show a login prompt instead of launching. The session state tracker should detect this and notify via WhatsApp.

---

## References

- [whatsapp-web.js documentation](https://wwebjs.dev/)
- [node-pty GitHub](https://github.com/microsoft/node-pty)
- [PM2 documentation](https://pm2.keymetrics.io/)
- Existing infrastructure: Tailscale mesh network, WSL2 SSH setup
- Specs location: `G:\My Drive\Work\Coded\specs\wa-claude\`
