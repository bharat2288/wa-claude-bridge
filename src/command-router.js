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

    // Kill command: kill_<project>
    if (buttonId.startsWith('kill_')) {
      const project = buttonId.slice(5);
      return this.sessionManager.kill(project);
    }

    // Restart command: restart_<project>
    if (buttonId.startsWith('restart_')) {
      const project = buttonId.slice(8);
      return this.sessionManager.restart(project);
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
        // No arg → show full list; with arg → filter or direct open
        return this.showProjectList(arg || '');

      case '/kill':
        if (!arg) {
          // No argument — show interactive list of active sessions
          return this.showKillList();
        }
        return this.sessionManager.kill(arg);

      case '/restart':
        if (!arg) {
          // No argument — show interactive list of active sessions
          return this.showRestartList();
        }
        return this.sessionManager.restart(arg);

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
          '/open — Project picker (or /open <prefix> to filter)',
          '/kill — Show session menu (or /kill <project> for direct)',
          '/restart — Show session menu (or /restart <project> for direct)',
          '/list — Show all active sessions',
          '/status — System health info',
          '/full — Resend last output untruncated',
          '/cancel — Interrupt current Claude query',
          '/help — This message',
          '',
          '*Interactive features:*',
          '• Action approvals show [Approve] [Deny] buttons',
          '• /open shows top 10 (active sessions first); /open t filters by prefix',
          '• /kill and /restart show active session menus',
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
   * Show interactive project list, optionally filtered by a prefix.
   * Active sessions are surfaced first, then alphabetical.
   * @param {string} filter - prefix to match against project names (empty = all)
   */
  async showProjectList(filter) {
    const allProjects = await this.sessionManager.getAvailableProjects();

    if (allProjects.length === 0) {
      return `No projects found in ${this.sessionManager.resolveProjectDir('')}`;
    }

    // Filter by prefix if provided
    const lowerFilter = filter.toLowerCase();
    const matched = filter
      ? allProjects.filter(p => p.title.toLowerCase().startsWith(lowerFilter))
      : allProjects;

    // Exact match → open directly
    if (filter && matched.length === 1) {
      return this.sessionManager.open(matched[0].id);
    }

    // Filter matched nothing → try as exact project name (could be a substring miss)
    if (filter && matched.length === 0) {
      const exact = allProjects.find(p => p.title.toLowerCase() === lowerFilter);
      if (exact) return this.sessionManager.open(exact.id);
      return `No projects matching "${filter}". Use /open to browse.`;
    }

    // Sort: active sessions first, then alphabetical
    const activeSessions = new Set(this.sessionManager.sessions.keys());
    const sorted = [...matched].sort((a, b) => {
      const aActive = activeSessions.has(a.id);
      const bActive = activeSessions.has(b.id);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    });

    // Tag active sessions in the description
    const tagged = sorted.map(p => ({
      ...p,
      description: activeSessions.has(p.id) ? '● Active session' : p.description || '',
    }));

    // WhatsApp caps at 10 rows
    const display = tagged.slice(0, 10);
    const total = matched.length;
    const overflow = total > 10;

    let bodyText;
    if (filter && overflow) {
      bodyText = `${total} projects match "${filter}" (showing 10). Try a longer prefix.`;
    } else if (filter) {
      bodyText = `Projects matching "${filter}":`;
    } else if (overflow) {
      bodyText = `Showing 10 of ${total}. Use /open <prefix> to filter.`;
    } else {
      bodyText = 'Select a project to open:';
    }

    try {
      await this.sendList(bodyText, 'Choose Project', null, [{
        title: 'Projects',
        rows: display.map(p => ({ id: p.id, title: p.title, description: p.description })),
      }]);
      return null;
    } catch (err) {
      // Fallback to text list
      console.error('[router] Failed to send list:', err.message);
      const list = display.map(p => `• ${p.title}${activeSessions.has(p.id) ? ' ●' : ''}`).join('\n');
      const more = overflow ? `\n\n...and ${total - 10} more — use /open <prefix>` : '';
      return `${bodyText}\n\n${list}${more}\n\nReply with: /open <project-name>`;
    }
  }

  /**
   * Show interactive list of active sessions for killing.
   */
  async showKillList() {
    const activeSessions = Array.from(this.sessionManager.sessions.keys());

    if (activeSessions.length === 0) {
      return 'No active sessions to kill. Use /list to see all sessions.';
    }

    const items = activeSessions.map(name => ({
      id: `kill_${name}`,
      title: name,
      description: name === this.sessionManager.activeProject ? 'Active' : 'Idle',
    }));

    try {
      await this.sendList(
        'Select a session to kill:',
        'Kill Session',
        items
      );
      return null;
    } catch (err) {
      console.error('[router] Failed to send kill list:', err.message);
      const list = activeSessions.map(name => `• ${name}`).join('\n');
      return `Active sessions:\n\n${list}\n\nReply with: /kill <project-name>`;
    }
  }

  /**
   * Show interactive list of active sessions for restarting.
   */
  async showRestartList() {
    const activeSessions = Array.from(this.sessionManager.sessions.keys());

    if (activeSessions.length === 0) {
      return 'No active sessions to restart. Use /list to see all sessions.';
    }

    const items = activeSessions.map(name => ({
      id: `restart_${name}`,
      title: name,
      description: name === this.sessionManager.activeProject ? 'Active' : 'Idle',
    }));

    try {
      await this.sendList(
        'Select a session to restart:',
        'Restart Session',
        items
      );
      return null;
    } catch (err) {
      console.error('[router] Failed to send restart list:', err.message);
      const list = activeSessions.map(name => `• ${name}`).join('\n');
      return `Active sessions:\n\n${list}\n\nReply with: /restart <project-name>`;
    }
  }

}
