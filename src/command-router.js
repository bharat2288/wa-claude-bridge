// Command router — parses incoming messages as commands or relays to active Claude session
// Commands start with / — everything else goes to the active Claude Code session

export class CommandRouter {
  constructor(sessionManager, sendList) {
    this.sessionManager = sessionManager;
    this.sendList = sendList;
  }

  /**
   * Handle an incoming message. Returns a response string (or null if no response needed).
   * @param {string} text - Message text from WhatsApp
   * @param {string} buttonReplyId - If this is a button reply, the button ID clicked
   * @returns {string|null|Promise<string|null>} Response to send back, or null if async events handle it
   */
  handle(text, buttonReplyId = null) {
    // Handle button clicks
    if (buttonReplyId) {
      return this.handleButtonReply(buttonReplyId);
    }

    const trimmed = text.trim();

    // Check if it's a command
    if (trimmed.startsWith('/')) {
      return this.handleCommand(trimmed);
    }

    // Not a command — relay to active Claude session
    return this.sessionManager.relay(trimmed);
  }

  /**
   * Handle interactive button/list replies.
   */
  handleButtonReply(buttonId) {
    // Approval buttons
    if (buttonId === 'approve') {
      return this.sessionManager.approveAction(true);
    }
    if (buttonId === 'deny') {
      return this.sessionManager.approveAction(false);
    }

    // Project selection from list — buttonId is the project name
    // Check if it's a valid project and open it
    return this.sessionManager.open(buttonId);
  }

  /**
   * Parse and execute a slash command.
   */
  handleCommand(text) {
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    switch (cmd) {
      case '/open':
        if (!arg) {
          // No argument — show interactive list
          return this.showProjectList();
        }
        return this.sessionManager.open(arg);

      case '/kill':
        if (!arg) {
          const list = this.sessionManager.list();
          return `Which session to kill?\n\n${list}\n\nUsage: /kill <project-name>`;
        }
        return this.sessionManager.kill(arg);

      case '/restart':
        return this.sessionManager.restart(arg || null);

      case '/list':
        return this.sessionManager.list();

      case '/status':
        return this.sessionManager.status();

      case '/full':
        return this.sessionManager.getFullOutput();

      // Tool approval commands
      case '/yes':
      case '/approve':
        return this.sessionManager.approveAction(true);

      case '/no':
      case '/deny':
        return this.sessionManager.approveAction(false);

      // Interrupt current query
      case '/cancel':
        return this.sessionManager.cancel();

      case '/help':
        return [
          '*wa-claude commands:*\n',
          '/open — Show project menu (or /open <project> for direct)',
          '/kill <project> — Terminate a session',
          '/restart [project] — Restart session (active if no name)',
          '/list — Show all active sessions',
          '/status — System health info',
          '/full — Resend last output untruncated',
          '/cancel — Interrupt current Claude query',
          '/help — This message',
          '',
          '*Interactive features:*',
          '• Action approvals show [Approve] [Deny] buttons',
          '• /open shows a tap-to-select project menu',
          '',
          'Any other text is sent to the active Claude Code session.',
        ].join('\n');

      default:
        // Unrecognized /commands are passed through to Claude as-is.
        // This lets Claude Code skills (/sessionstart, /commit, etc.) work
        // transparently — Claude sees the skill name and invokes it.
        return this.sessionManager.relay(text);
    }
  }

  /**
   * Show interactive list of available projects.
   */
  async showProjectList() {
    const projects = await this.sessionManager.getAvailableProjects();

    if (projects.length === 0) {
      return `No projects found in ${this.sessionManager.resolveProjectDir('')}`;
    }

    // WhatsApp list supports max 10 items — take first 10
    const items = projects.slice(0, 10);

    try {
      await this.sendList(
        'Select a project to open:',
        'Choose Project',
        items
      );
      return null; // List sent, no text response needed
    } catch (err) {
      // Fallback to text list if interactive list fails
      console.error('[router] Failed to send list:', err.message);
      const list = items.map(p => `• ${p.title}`).join('\n');
      return `Available projects:\n\n${list}\n\nReply with: /open <project-name>`;
    }
  }
}
