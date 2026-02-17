# wa-claude

A WhatsApp bridge to [Claude Code](https://claude.com/claude-code) via Anthropic's [Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). Send messages from your phone, get Claude Code responses back — complete with tool use, file editing, and Bash command approval.

## How It Works

```
WhatsApp (phone)
    → Meta Cloud API webhook
        → Express server (command routing)
            → Claude Agent SDK (query + streaming)
                → ContentProcessor (summarize for mobile)
                    → WhatsApp formatter (MD → WA)
                        → Meta Cloud API → WhatsApp
```

Claude Code runs as a subprocess via the Agent SDK. Each project gets its own session with conversation continuity. The bridge handles:

- **Streaming text delivery** — buffers responses and sends in batches
- **Tool approval** — reads/edits auto-approved; Bash commands relayed to WhatsApp with approve/deny buttons
- **Session resume** — conversations persist across messages via SDK session IDs
- **Project context injection** — specs files automatically loaded into Claude's system prompt
- **Output summarization** — long responses, code blocks, and diffs compressed for mobile readability

## Commands

| Command | Description |
|---------|-------------|
| `/open <project>` | Start or switch to a project session |
| `/kill <project>` | Terminate a session |
| `/restart [project]` | Restart Claude Code in a session |
| `/list` | Show all active sessions |
| `/status` | System health info |
| `/full` | Resend last output untruncated |
| `/yes` or `/no` | Approve or deny a pending Bash command |
| `/cancel` | Interrupt current Claude query |

Any other text is sent directly to Claude Code as a prompt.

## Setup

### Prerequisites

- Node.js 18+
- [Claude Code CLI](https://claude.com/claude-code) installed and authenticated
- [Meta WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/cloud-api) app with a phone number
- [ngrok](https://ngrok.com/) or similar tunnel for webhook delivery

### Installation

```bash
git clone https://github.com/bharat2288/wa-claude.git
cd wa-claude
npm install
```

### Configuration

Create a `.env` file (or set environment variables):

```env
WA_CLAUDE_ACCESS_TOKEN=<WhatsApp Cloud API access token>
WA_CLAUDE_PHONE_NUMBER_ID=<WhatsApp phone number ID>
WA_CLAUDE_WEBHOOK_VERIFY_TOKEN=<shared secret for webhook verification>
WA_CLAUDE_ALLOWED_NUMBER=<your phone number, e.g. 15551234567>
WA_CLAUDE_MODEL=sonnet  # optional, defaults to sonnet
```

### Running

```bash
# Start the server
npm start

# Or with auto-restart on changes
npm run dev
```

Then expose port 3100 via ngrok:

```bash
ngrok http 3100
```

Configure the ngrok URL as your webhook in the Meta Developer Console: `https://your-ngrok-url/webhook`

## Architecture

| File | Purpose |
|------|---------|
| `server.js` | Express entry point, webhook wiring |
| `src/claude-session.js` | Agent SDK wrapper — query, streaming, tool approval, session resume |
| `src/session-manager.js` | Multi-session management, event wiring to output pipeline |
| `src/command-router.js` | Slash command parsing, button/list handling |
| `src/content-processor.js` | Output summarization for mobile (truncation, compression) |
| `src/wa-formatter.js` | Markdown → WhatsApp formatting, message splitting |
| `src/wa-client.js` | Meta WhatsApp Cloud API client |
| `src/webhook.js` | Express webhook routes |
| `src/config.js` | Configuration (env vars, SDK settings, thresholds) |

## Limitations

- Single-user only (one whitelisted phone number)
- DM-based (no group routing)
- WhatsApp's 4096-char message limit means long responses are split or truncated
- SDK spawns a subprocess per query — first message has a few seconds of cold start latency
- Custom Claude Code skills (`/sessionstart`, etc.) don't work via SDK — use natural language instead

## License

MIT
