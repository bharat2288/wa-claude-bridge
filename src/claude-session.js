// Claude session — wraps @anthropic-ai/claude-agent-sdk query()
// Replaces: pty-wrapper.js + terminal-emulator.js + screen-reader.js
//
// Responsibilities:
// - Send prompts via SDK query(), streaming response events
// - Manage session ID per project (resume conversations)
// - Handle tool approval via canUseTool callback
// - Buffer streaming text for batched WhatsApp delivery
// - Emit structured events for the session manager to relay

import { query } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import config from './config.js';

export class ClaudeSession extends EventEmitter {
  constructor(projectName, projectDir) {
    super();
    this.projectName = projectName;
    this.projectDir = projectDir;

    // Session ID — persisted across messages for conversation continuity
    this._sessionId = null;

    // Current running query (for interrupt support)
    this._currentQuery = null;
    this._abortController = null;

    // Pending Bash approval — a Promise resolve/reject pair
    // When Claude wants to run a Bash command and we relay to WhatsApp,
    // we hold this promise until the user replies /yes or /no
    this._pendingApproval = null;

    // Text buffer for batched streaming delivery
    this._textBuffer = '';
    this._bufferTimer = null;
    this._isActive = false;

    // Accumulated full response text (for /full command)
    this._fullResponse = '';
  }

  get sessionId() {
    return this._sessionId;
  }

  get isActive() {
    return this._isActive;
  }

  /**
   * Send a prompt to Claude. Streams response events back via EventEmitter.
   * Returns when the full response is complete.
   */
  async send(prompt) {
    this._isActive = true;
    this._fullResponse = '';
    this._textBuffer = '';

    // Set up abort controller for interrupt support
    this._abortController = new AbortController();

    // Build query options
    const options = {
      model: config.claude.model,
      permissionMode: config.claude.permissionMode,
      cwd: this.projectDir,
      maxTurns: config.claude.maxTurns,
      abortController: this._abortController,

      // Inject project context via system prompt append.
      // Reads specs/*-status.md and *-design.md so Claude knows
      // where the project is before answering anything.
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: this._buildContextAppend(),
      },

      // Custom tool permission handler — auto-approve reads/edits,
      // relay Bash commands to WhatsApp for human approval
      canUseTool: async (toolName, input, { signal }) => {
        return this._handleToolApproval(toolName, input, signal);
      },
    };

    // Resume previous session if we have one
    if (this._sessionId) {
      options.resume = this._sessionId;
    }

    try {
      const q = query({ prompt, options });
      this._currentQuery = q;

      // Iterate through streaming messages
      for await (const message of q) {
        if (this._abortController.signal.aborted) break;

        // Debug: log every message type we receive
        console.log(`[claude] ${this.projectName} — msg: type=${message.type}${message.subtype ? ` subtype=${message.subtype}` : ''}`);

        switch (message.type) {
          case 'system':
            // Capture session ID from init message
            if (message.subtype === 'init') {
              this._sessionId = message.session_id;
              console.log(`[claude] ${this.projectName} — session: ${this._sessionId}`);
              console.log(`[claude] ${this.projectName} — model: ${message.model}, tools: ${message.tools?.length || 0}`);
            }
            break;

          case 'assistant':
            // Capture session ID from assistant messages too
            if (message.session_id) {
              this._sessionId = message.session_id;
            }
            this._processAssistantMessage(message);
            break;

          case 'result':
            this._handleResult(message);
            break;

          default:
            console.log(`[claude] ${this.projectName} — unhandled msg type: ${message.type}`, JSON.stringify(message).slice(0, 200));
            break;
        }
      }
    } catch (err) {
      // AbortError is expected when we call interrupt()
      if (err.name === 'AbortError' || this._abortController.signal.aborted) {
        console.log(`[claude] ${this.projectName} — query interrupted`);
        this.emit('interrupted');
      } else {
        console.error(`[claude] ${this.projectName} — error:`, err.message);
        this.emit('error', err);
      }
    } finally {
      // Flush any remaining buffered text
      this._flushBuffer();
      this._isActive = false;
      this._currentQuery = null;
      this._abortController = null;
    }
  }

  /**
   * Interrupt the currently running query.
   */
  async interrupt() {
    if (this._abortController) {
      this._abortController.abort();
    }

    // Reject any pending approval
    if (this._pendingApproval) {
      this._pendingApproval.reject(new Error('interrupted'));
      this._pendingApproval = null;
    }
  }

  /**
   * Resolve a pending Bash approval from WhatsApp user.
   * Called when user sends /yes or /no.
   */
  resolvePendingApproval(approved) {
    if (!this._pendingApproval) {
      return false; // No pending approval
    }

    this._pendingApproval.resolve(approved);
    this._pendingApproval = null;
    return true;
  }

  /**
   * Get the full accumulated response text (for /full command).
   */
  getFullResponse() {
    return this._fullResponse.trim() || '(no recent output)';
  }

  // --- Internal methods ---

  /**
   * Build the system prompt append with project context.
   * Reads specs/*-status.md and *-design.md so Claude starts informed.
   * Returns empty string if no specs found (graceful fallback).
   */
  _buildContextAppend() {
    const specsDir = join(this.projectDir, 'specs');
    const sections = [];

    try {
      const files = readdirSync(specsDir);

      // Read status file — most important for "where are we"
      const statusFile = files.find(f => f.endsWith('-status.md'));
      if (statusFile) {
        const content = readFileSync(join(specsDir, statusFile), 'utf-8');
        sections.push(`## Project Status (from ${statusFile})\n\n${content}`);
      }

      // Read design file — what the project is
      const designFile = files.find(f => f.endsWith('-design.md'));
      if (designFile) {
        const content = readFileSync(join(specsDir, designFile), 'utf-8');
        sections.push(`## Project Design (from ${designFile})\n\n${content}`);
      }
    } catch {
      // No specs dir or read error — that's fine, proceed without context
      console.log(`[claude] ${this.projectName} — no specs found, proceeding without context`);
    }

    if (sections.length === 0) return '';

    return [
      '\n\n# Project Context (injected by wa-claude bridge)\n',
      'You are being accessed via WhatsApp through the wa-claude bridge.',
      'The user is chatting from their phone. Keep responses concise.',
      'The following project specs were loaded automatically:\n',
      ...sections,
    ].join('\n');
  }

  /**
   * Handle tool approval requests from the SDK.
   * Auto-approve reads and edits. Relay Bash commands to WhatsApp.
   */
  async _handleToolApproval(toolName, input, signal) {
    // Auto-approve safe tools (reads, edits, search, glob, grep)
    const autoApproveTools = config.claude.allowedTools;
    if (autoApproveTools.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // For Bash and other tools — relay to WhatsApp for user approval
    const commandDesc = toolName === 'Bash'
      ? `\`${input.command}\``
      : `${toolName}: ${JSON.stringify(input).slice(0, 200)}`;

    this.emit('approval-needed', {
      toolName,
      input,
      description: commandDesc,
    });

    // Wait for user to reply via WhatsApp
    const approved = await new Promise((resolve, reject) => {
      this._pendingApproval = { resolve, reject };

      // Also listen for abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          reject(new Error('interrupted'));
        }, { once: true });
      }
    });

    if (approved) {
      return { behavior: 'allow', updatedInput: input };
    } else {
      return {
        behavior: 'deny',
        message: 'User denied this action via WhatsApp.',
        interrupt: false,
      };
    }
  }

  /**
   * Process an assistant message — extract text and tool-use blocks.
   */
  _processAssistantMessage(message) {
    const content = message.message?.content;

    // Debug: log the shape of what we receive
    console.log(`[claude] ${this.projectName} — assistant msg keys: ${Object.keys(message).join(', ')}`);
    console.log(`[claude] ${this.projectName} — message.message keys: ${message.message ? Object.keys(message.message).join(', ') : 'null'}`);

    if (!content || !Array.isArray(content)) {
      console.log(`[claude] ${this.projectName} — no content array, raw message:`, JSON.stringify(message).slice(0, 500));
      return;
    }

    console.log(`[claude] ${this.projectName} — content blocks: ${content.length}, types: [${content.map(b => b.type).join(', ')}]`);

    for (const block of content) {
      if (block.type === 'text' && block.text) {
        console.log(`[claude] ${this.projectName} — text block (${block.text.length} chars): "${block.text.slice(0, 100)}"`);

        // Accumulate text for full response
        this._fullResponse += block.text;

        // Buffer for batched delivery
        this._bufferText(block.text);

      } else if (block.type === 'tool_use') {
        // Emit tool-use notification (e.g., "Reading src/auth.py...")
        const toolDesc = this._describeToolUse(block.name, block.input);
        this.emit('tool-start', {
          toolName: block.name,
          description: toolDesc,
        });
      } else {
        console.log(`[claude] ${this.projectName} — other block type: ${block.type}`, JSON.stringify(block).slice(0, 200));
      }
    }
  }

  /**
   * Handle a result message (query complete or error).
   */
  _handleResult(message) {
    if (message.subtype === 'success') {
      console.log(`[claude] ${this.projectName} — done (${message.num_turns} turns, $${message.total_cost_usd?.toFixed(4) || '?'})`);
      console.log(`[claude] ${this.projectName} — result text (${message.result?.length || 0} chars): "${(message.result || '').slice(0, 200)}"`);
      console.log(`[claude] ${this.projectName} — fullResponse accumulated (${this._fullResponse.length} chars)`);

      // If streaming didn't capture any text but the result has text,
      // emit it now as a fallback — this handles cases where the SDK
      // delivers all text in the result rather than in assistant messages
      if (!this._fullResponse.trim() && message.result?.trim()) {
        console.log(`[claude] ${this.projectName} — using result.result as fallback text`);
        this._fullResponse = message.result;
        this.emit('text-chunk', message.result);
      }

      this.emit('done', {
        result: message.result,
        turns: message.num_turns,
        cost: message.total_cost_usd,
      });
    } else {
      // Error result (max_turns, execution error, etc.)
      const errorMsg = message.errors?.join('; ') || message.subtype;
      console.error(`[claude] ${this.projectName} — error result: ${errorMsg}`);
      this.emit('error', new Error(errorMsg));
    }
  }

  /**
   * Buffer text and flush to WhatsApp at intervals.
   * Sends batched chunks every streamBufferMs (default 3s).
   */
  _bufferText(text) {
    this._textBuffer += text;

    // Reset the flush timer each time new text arrives
    if (this._bufferTimer) clearTimeout(this._bufferTimer);

    this._bufferTimer = setTimeout(() => {
      this._flushBuffer();
    }, config.claude.streamBufferMs);
  }

  /**
   * Flush the text buffer — emit buffered text as a chunk.
   */
  _flushBuffer() {
    if (this._bufferTimer) {
      clearTimeout(this._bufferTimer);
      this._bufferTimer = null;
    }

    const text = this._textBuffer.trim();
    if (text) {
      this.emit('text-chunk', text);
      this._textBuffer = '';
    }
  }

  /**
   * Create a human-readable description of a tool use.
   */
  _describeToolUse(toolName, input) {
    switch (toolName) {
      case 'Read':
        return `Reading ${input.file_path || 'file'}`;
      case 'Write':
        return `Writing ${input.file_path || 'file'}`;
      case 'Edit':
        return `Editing ${input.file_path || 'file'}`;
      case 'Bash':
        return `Running: ${(input.command || '').slice(0, 80)}`;
      case 'Glob':
        return `Searching for ${input.pattern || 'files'}`;
      case 'Grep':
        return `Searching for "${(input.pattern || '').slice(0, 40)}"`;
      case 'WebFetch':
        return `Fetching ${input.url || 'URL'}`;
      default:
        return `Using ${toolName}`;
    }
  }
}
