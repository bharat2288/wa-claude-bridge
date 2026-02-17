// Session manager — manages Claude SDK sessions with output pipeline
// Pipeline: ClaudeSession → ContentProcessor → WhatsAppFormatter → sendMessage

import { ClaudeSession } from './claude-session.js';
import { ContentProcessor } from './content-processor.js';
import { WhatsAppFormatter } from './wa-formatter.js';
import config from './config.js';
import { resolve } from 'path';
import { existsSync } from 'fs';

export class SessionManager {
  constructor(sendMessage, sendButtons, sendList) {
    // Callbacks to send WhatsApp replies
    this.sendMessage = sendMessage;
    this.sendButtons = sendButtons;
    this.sendList = sendList;

    // Map of projectName → { session, processor, formatter }
    this.sessions = new Map();

    // Currently active project name (messages route here)
    this.activeProject = null;
  }

  /**
   * Open (or switch to) a project session.
   * Creates a new ClaudeSession if one doesn't exist for this project.
   */
  open(projectName) {
    const projectDir = this.resolveProjectDir(projectName);
    if (!projectDir || !existsSync(projectDir)) {
      return `Project not found: "${projectName}" — no directory at ${projectDir || 'unknown'}`;
    }

    // If session already exists, just switch to it
    if (this.sessions.has(projectName)) {
      this.activeProject = projectName;
      const entry = this.sessions.get(projectName);
      const state = entry.session.isActive ? 'active' : 'idle';
      return `Switched to ${projectName} (${state})`;
    }

    // Create Claude SDK session
    const session = new ClaudeSession(projectName, projectDir);
    const processor = new ContentProcessor();
    const formatter = new WhatsAppFormatter(config.output.maxMessageLength);

    // Wire session events → processing pipeline → WhatsApp

    // Buffered text chunks — process and send
    session.on('text-chunk', (text) => {
      const processed = processor.summarize(text);
      if (!processed) return;

      const formatted = formatter.format(processed);
      const chunks = formatter.split(formatted);
      for (const chunk of chunks) {
        this.sendMessage(chunk);
      }
    });

    // Tool-use notifications — send concise status
    session.on('tool-start', ({ description }) => {
      this.sendMessage(`_${description}_`);
    });

    // Bash approval requests — relay to WhatsApp with interactive buttons
    session.on('approval-needed', ({ description }) => {
      this.sendButtons(
        `*[ACTION NEEDED]*\n\nClaude wants to run:\n${description}`,
        [
          { id: 'approve', title: '✓ Approve' },
          { id: 'deny', title: '✗ Deny' },
        ]
      ).catch(err => {
        // Fallback to text if buttons fail
        console.error('[session] Failed to send buttons:', err.message);
        this.sendMessage(
          `*[ACTION NEEDED]*\n\nClaude wants to run:\n${description}\n\nReply /yes to approve or /no to deny.`
        );
      });
    });

    // Query complete
    session.on('done', ({ turns, cost }) => {
      console.log(`[session] ${projectName} — query complete (${turns} turns, $${cost?.toFixed(4) || '?'})`);
    });

    // Errors
    session.on('error', (err) => {
      this.sendMessage(`*[ERROR]* ${projectName}: ${err.message}`);
    });

    // Interrupted
    session.on('interrupted', () => {
      this.sendMessage(`_${projectName} — interrupted._`);
    });

    // Store and activate
    this.sessions.set(projectName, { session, processor, formatter });
    this.activeProject = projectName;

    return `Opened ${projectName} — Claude Code ready in ${projectDir}. Send a message to start.`;
  }

  /**
   * Send a message to the active Claude session.
   * Returns null — response comes asynchronously via events.
   */
  relay(text) {
    if (!this.activeProject) {
      return 'No active session. Use /open <project> to start one.';
    }

    const entry = this.sessions.get(this.activeProject);
    if (!entry) {
      return 'Session not found. Use /open <project> to start one.';
    }

    if (entry.session.isActive) {
      return `${this.activeProject} is still working on the previous message. Wait for it to finish or /cancel.`;
    }

    console.log(`[session] Sending to ${this.activeProject}: "${text.slice(0, 80)}"`);

    // Send acknowledgment immediately — SDK cold start can take a few seconds
    this.sendMessage(`_Working on it..._`);

    // Fire off the query (async — events will deliver the response)
    entry.session.send(text).catch((err) => {
      console.error(`[session] ${this.activeProject} send error:`, err.message);
      this.sendMessage(`*[ERROR]* Failed to send: ${err.message}`);
    });

    return null; // Response comes via events
  }

  /**
   * Approve or deny a pending Bash command for the active session.
   */
  approveAction(approved) {
    if (!this.activeProject) {
      return 'No active session.';
    }

    const entry = this.sessions.get(this.activeProject);
    if (!entry) {
      return 'No active session.';
    }

    const resolved = entry.session.resolvePendingApproval(approved);
    if (!resolved) {
      return 'No pending approval to respond to.';
    }

    return approved ? '_Approved._' : '_Denied._';
  }

  /**
   * Interrupt the current query on the active session.
   */
  async cancel() {
    if (!this.activeProject) {
      return 'No active session.';
    }

    const entry = this.sessions.get(this.activeProject);
    if (!entry) {
      return 'No active session.';
    }

    if (!entry.session.isActive) {
      return `${this.activeProject} is idle — nothing to cancel.`;
    }

    await entry.session.interrupt();
    return `Cancelling ${this.activeProject}...`;
  }

  /**
   * Kill a project session (remove it entirely).
   */
  kill(projectName) {
    const entry = this.sessions.get(projectName);
    if (!entry) {
      return `No session found for: ${projectName}`;
    }

    // Interrupt if active, then remove
    if (entry.session.isActive) {
      entry.session.interrupt();
    }
    entry.session.removeAllListeners();
    this.sessions.delete(projectName);

    if (this.activeProject === projectName) {
      this.activeProject = null;
    }

    return `Killed session: ${projectName}`;
  }

  /**
   * Restart a project session (kill + re-open).
   */
  restart(projectName) {
    const target = projectName || this.activeProject;
    if (!target) {
      return 'No project specified and no active session.';
    }

    if (!this.sessions.has(target)) {
      return `No session found for: ${target}. Use /open ${target} to create one.`;
    }

    this.kill(target);
    return this.open(target);
  }

  /**
   * List all sessions with their state.
   */
  list() {
    if (this.sessions.size === 0) {
      return 'No active sessions. Use /open <project> to start one.';
    }

    const lines = ['*Active sessions:*\n'];
    for (const [name, entry] of this.sessions) {
      const marker = name === this.activeProject ? '> ' : '  ';
      const state = entry.session.isActive ? 'working' : 'idle';
      const sid = entry.session.sessionId ? ` (${entry.session.sessionId.slice(0, 8)}...)` : '';
      lines.push(`${marker}*${name}* — ${state}${sid}`);
    }

    return lines.join('\n');
  }

  /**
   * Get system status.
   */
  status() {
    const uptime = Math.floor(process.uptime());
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const sessions = this.sessions.size;

    return [
      '*wa-claude status*',
      `Uptime: ${uptime}s`,
      `Memory: ${mem}MB`,
      `Sessions: ${sessions}`,
      `Active: ${this.activeProject || 'none'}`,
      `Model: ${config.claude.model}`,
      `Permission: ${config.claude.permissionMode}`,
    ].join('\n');
  }

  /**
   * Get last full (unsummarized) output for the active session.
   */
  getFullOutput() {
    if (!this.activeProject) {
      return 'No active session.';
    }

    const entry = this.sessions.get(this.activeProject);
    return entry?.session.getFullResponse() || '(no recent output)';
  }

  /**
   * Resolve project name to a directory path.
   */
  resolveProjectDir(projectName) {
    if (config.projectOverrides[projectName]) {
      return config.projectOverrides[projectName];
    }
    return resolve(config.projectRoot, projectName);
  }

  /**
   * Get list of available projects (subdirectories in projectRoot).
   */
  async getAvailableProjects() {
    const { readdirSync, statSync } = await import('fs');

    try {
      const entries = readdirSync(config.projectRoot);
      const projects = [];

      for (const entry of entries) {
        const fullPath = resolve(config.projectRoot, entry);
        try {
          if (statSync(fullPath).isDirectory()) {
            // Skip hidden directories and node_modules
            if (!entry.startsWith('.') && entry !== 'node_modules') {
              projects.push({
                id: entry,
                title: entry,
                description: fullPath,
              });
            }
          }
        } catch {
          // Skip entries we can't stat
        }
      }

      // Sort alphabetically
      projects.sort((a, b) => a.title.localeCompare(b.title));

      return projects;
    } catch (err) {
      console.error('[session] Failed to list projects:', err.message);
      return [];
    }
  }
}
