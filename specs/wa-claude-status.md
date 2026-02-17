# wa-claude — Status

> Session continuity document. Claude Code updates this at end of each session.
> Read this first to know where we are.

---

## Sessions

| Session | Focus | Date | Status |
|---------|-------|------|--------|
| `core-scaffold` | Full architecture implementation — all modules, PTY lifecycle, output processing, debug scripts | 2025-02-14 | ✓ |
| `status-setup` | Created status file, assessed project state | 2025-02-15 | ✓ |
| `meta-app-e2e` | Meta app setup, ngrok tunnel, first live WhatsApp ↔ Claude Code round-trip, TUI noise filtering | 2026-02-15 | ✓ |
| `xterm-pipeline` | Replaced regex output processor with xterm.js headless pipeline. Hit fundamental issues with Claude Code's terminal behavior | 2026-02-15 | ❌ |
| `sdk-migration` | Replaced entire PTY + xterm.js pipeline with Claude Agent SDK. Clean structured output, no TUI parsing needed. | 2026-02-16 | ✓ |
| `interactive-ux` | Added WhatsApp interactive messages — button approvals and project selection menu | 2026-02-17 | ✓ |
| `project-tagging` | Visual project tags on all messages — 📂 *projectName* prefix for clear context | 2026-02-17 | ✓ |
| `interactive-expansion` | Enhanced all interactive commands — `/kill`, `/restart` get tap menus; `/open` supports 100 projects with alphabetical sections | 2026-02-17 | ✓ |

**Status key:** ✓ Complete | 🔄 In Progress | ⏸ Paused | ❌ Abandoned

---

## Current State

### Working
- **Claude Agent SDK integration**: `@anthropic-ai/claude-agent-sdk` query() replaces PTY + xterm.js + screen scraping
- **Streaming text delivery**: Buffered every 3s, processed through ContentProcessor → WhatsAppFormatter → wa-client
- **Tool approval flow**: Reads/edits auto-approved, Bash commands relayed to WhatsApp with interactive buttons
- **Interactive approvals**: Bash commands show [✓ Approve] [✗ Deny] buttons (auto-fallback to text)
- **Interactive project menu**: `/open` shows alphabetically-grouped dropdown (up to 100 projects, auto-fallback to text list)
- **Interactive session menus**: `/kill` and `/restart` show tap-to-select active session lists
- **Session resume**: Session IDs persisted per project, conversations continue across messages
- **Project tagging**: Every message prefixed with `📂 *projectName* |` for instant visual context when switching projects
- **Slash command pass-through**: Unrecognized /commands forwarded to Claude (skills work transparently)
- **WhatsApp formatting**: Markdown → WhatsApp native (bold, italic, strikethrough, headers, links, tables)
- **System User permanent token**: Set up via Meta Business Suite
- **Dev Server Manager**: Port 3100 registered
- **Webhook + command routing**: All working (handles text, button_reply, list_reply)

### Not Yet Tested
- Interactive button approvals (live WhatsApp test)
- Interactive project menu (live WhatsApp test)
- Project tagging display on WhatsApp (requires server restart)
- Session resume across multiple messages
- Hooks/skills firing through SDK subprocess
- Long conversation token limits
- Fallback behavior when interactive messages fail

### Resolved (via SDK migration)
- ~~Error #24: Claude Code renders in normal buffer~~ — SDK gives structured JSON, no buffer parsing needed
- ~~Error #25: Spinner defeats silence-based debounce~~ — SDK streams text events, no debounce needed
- ~~Error #26: PS banner / welcome screen leaks~~ — No PTY, no shell noise

---

## Decisions Made

### Replace PTY pipeline with Claude Agent SDK (Decision #59)
- **Context**: PTY + xterm.js + screen scraping had 3 unresolved errors all caused by Claude Code rendering in normal buffer. Content extraction fundamentally fragile.
- **Choice**: @anthropic-ai/claude-agent-sdk query() for structured JSON output, streaming events, programmatic tool approval
- **Result**: Deleted ~600 lines (3 files), created ~200 lines (1 file). Codebase simplified dramatically.

### WhatsApp Cloud API over whatsapp-web.js
- **Context**: Design doc originally specified `whatsapp-web.js`
- **Choice**: Use Meta Cloud API with Express webhook

### Single active session model (DM-only, no groups)
- **Choice**: DM-only. One active session at a time, switch with `/open <project>`.

### Use WhatsApp interactive messages (Decision #60)
- **Context**: Typing `/yes`, `/no`, and project names on mobile is slow and error-prone
- **Choice**: Use Meta Cloud API interactive messages (buttons + lists) with auto-fallback to text
- **Result**: Approval prompts show [✓ Approve] [✗ Deny] buttons. `/open` shows dropdown menu of projects. Much better mobile UX.

### Project tagging for visual context (Decision #61)
- **Context**: Single active session model means switching projects can be confusing — no visual indicator which project Claude is responding from
- **Choice**: Prefix every message with `📂 *projectName* |` — bold, emoji, clear separator
- **Result**: Instant visual context on every message. Tags applied to all event types (text, tool notifications, errors, approvals). System commands NOT tagged.

### Expand all interactive commands (Decision #62)
- **Context**: `/open` had interactive list, but `/kill` and `/restart` required typing project names. 10-project limit on `/open` was arbitrary and limiting.
- **Choice**: Add interactive lists to `/kill` and `/restart`. Expand `/open` to 100 projects using alphabetical sections (10 sections × 10 items).
- **Result**: Consistent UX across all commands. Much better mobile experience. Alphabetical grouping makes large project lists navigable.

---

## Next Session

> Specific, actionable tasks. First item = start here.

### Priority 1: Test new interactive features (requires server restart)
- [ ] Restart server: `pm2 restart wa-claude` or `node server.js`
- [ ] Send `/open` → verify alphabetically-grouped project menu appears
- [ ] Tap a project from menu → verify it opens
- [ ] Send `/kill` (no arg) → verify active sessions menu appears
- [ ] Tap a session from kill menu → verify it terminates
- [ ] Send `/restart` (no arg) → verify active sessions menu appears
- [ ] Tap a session from restart menu → verify it restarts
- [ ] Verify project tags appear on all messages: `📂 *projectName* | text`
- [ ] Trigger Bash approval → verify [Approve] [Deny] buttons appear
- [ ] Test fallback: artificially break interactive API, verify text fallback works

### Priority 2: Git + Documentation
- [ ] Initialize git repo, commit all changes
- [ ] Update design doc to reflect SDK architecture + interactive UX
- [ ] Add interactive features to README

### Priority 3: Stability
- [ ] PM2 setup for persistent daemon
- [ ] Consider Cloudflare Tunnel (only if ngrok becomes problematic)
- [ ] Handle edge cases (very long responses, SDK errors, cold start latency)

---

## Architecture (current)

```
WhatsApp (text/button/list) → Meta webhook → server.js
                                                 ↓
                                           CommandRouter
                                            - handles buttonReplyId (approve/deny/kill_*/restart_*)
                                            - /open, /kill, /restart → sendList() with sections
                                                 ↓
                                           SessionManager
                                            - sendButtons/sendList callbacks
                                                 ↓
                                           ClaudeSession (@anthropic-ai/claude-agent-sdk)
                                            → query() with streaming
                                            → canUseTool callback (approval flow)
                                            → session resume
                                                 ↓
                                           ContentProcessor (summarize/detect)
                                                 ↓
                                           WhatsAppFormatter (MD→WA + project tag + split)
                                                 ↓
                                           wa-client.js (sendMessage/sendButtons/sendList)
                                                 ↓
                                           Meta API → WhatsApp
```

## Files

| File | Purpose |
|------|---------|
| `src/claude-session.js` | SDK wrapper — query(), streaming, tool approval, session resume |
| `src/session-manager.js` | Wires ClaudeSession events → processing pipeline → WhatsApp. Uses sendButtons for approvals. |
| `src/command-router.js` | Slash commands + button routing. `/open`/`/kill`/`/restart` → interactive lists, handles all button IDs |
| `src/content-processor.js` | Error detection, summarization, code block truncation |
| `src/wa-formatter.js` | Markdown → WhatsApp formatting, project tagging, message splitting |
| `src/wa-client.js` | Meta WhatsApp Cloud API client — sendMessage/sendButtons/sendList (multi-section support) |
| `src/webhook.js` | Express webhook routes — handles text, interactive.button_reply, interactive.list_reply |
| `src/config.js` | Config (WhatsApp creds, Claude SDK settings, output thresholds) |
| `server.js` | Entry point — Express server, message routing, wires interactive callbacks |
| `INTERACTIVE.md` | Documentation for interactive WhatsApp features |

## Env Vars (in C:\Users\bhara\dev\.env)

```
WA_CLAUDE_ACCESS_TOKEN=<System User permanent token>
WA_CLAUDE_PHONE_NUMBER_ID=<from Meta API Setup>
WA_CLAUDE_WEBHOOK_VERIFY_TOKEN=<self-generated shared secret>
WA_CLAUDE_MODEL=sonnet  (optional, defaults to sonnet)
```

---

## Notes

- Ngrok dashboard at http://localhost:4040 for inspecting webhook traffic
- Meta Developer Console: https://developers.facebook.com/apps/ → "WA Claude Bridge"
- System User token created in Meta Business Settings → System Users (permanent, all permissions)
- SDK v0.2.42 installed. permissionMode: acceptEdits. maxTurns: 50.
- Interactive messages: buttons (max 3, max 20 chars), lists (max 10 sections × 10 items = 100 total, max 24 chars per title)
- Auto-fallback to text if interactive API calls fail (logged to console)
- Project tags: Format `📂 *projectName* |` applied to all session messages, NOT applied to system commands
- Button ID format: `approve`/`deny` for actions, `kill_<project>` and `restart_<project>` for session commands, plain project name for `/open`
