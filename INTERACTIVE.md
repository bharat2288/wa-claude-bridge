# Interactive WhatsApp Features

wa-claude now supports WhatsApp's native interactive message types for a better UX.

---

## 1. Button-Based Approvals

When Claude wants to run a Bash command, you'll see:

```
[ACTION NEEDED]

Claude wants to run:
List files in current directory

[✓ Approve]  [✗ Deny]
```

**Just tap a button** — no need to type `/yes` or `/no` anymore.

### Fallback
If buttons fail to send (rare), you'll get the old text-based prompt:
```
Reply /yes to approve or /no to deny.
```

---

## 2. Project Selection Menu

Type `/open` with **no project name** to get an interactive menu:

```
Select a project to open:

[Choose Project ▼]
```

Tap it to see a dropdown list of all projects in `C:\Users\bhara\dev\`:

```
• backup-scripts
• claude-workflow-system
• devserver-manager
• knowledge-viewer
• wa-claude
...
```

**Tap any project** to open it immediately — no typing needed.

### Direct Open Still Works
If you already know the project name:
```
/open wa-claude
```
...opens it directly without the menu.

### Fallback
If the interactive list fails, you'll get a text list:
```
Available projects:

• wa-claude
• scholia
• knowledge-viewer

Reply with: /open <project-name>
```

---

## How It Works

### WhatsApp Cloud API Interactive Messages
We now use three message types:

1. **Text** — normal messages (default)
2. **Buttons** — up to 3 quick-reply buttons
3. **Lists** — dropdown menus with up to 10 items

### Message Flow

**Button clicks:**
```
WhatsApp → webhook receives interactive.button_reply
         → CommandRouter.handleButtonReply(buttonId)
         → SessionManager executes action
```

**List selections:**
```
WhatsApp → webhook receives interactive.list_reply
         → CommandRouter.handleButtonReply(listItemId)
         → SessionManager.open(projectName)
```

### Code Changes

- `src/wa-client.js` — added `sendButtons()` and `sendList()`
- `src/webhook.js` — parses `message.interactive` payloads
- `src/command-router.js` — handles button/list IDs, shows project menu
- `src/session-manager.js` — uses buttons for approvals, discovers projects
- `server.js` — wires new functions to SessionManager + CommandRouter

---

## Limits

- **Buttons**: Max 3 per message
- **Lists**: Max 10 items per list
- **Button text**: Max 20 characters
- **List item title**: Max 24 characters

Projects beyond the first 10 won't appear in the menu (use direct `/open <name>` instead).

---

## Testing

1. **Approval buttons**: Send a message that triggers a Bash command
2. **Project menu**: Send `/open` with no argument

Both should show interactive elements. If not, check logs for errors — fallback text mode will activate automatically.
