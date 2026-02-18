// wa-claude — WhatsApp to Claude Code bridge via Agent SDK
// Entry point: Express server for Meta webhook + Claude session management

// Strip CLAUDECODE env var so SDK subprocess doesn't think it's nested.
// Must happen before any imports that might spawn Claude Code.
delete process.env.CLAUDECODE;

import express from 'express';
import config from './src/config.js';
import webhook from './src/webhook.js';
import { sendMessage, sendButtons, sendList } from './src/wa-client.js';
import { SessionManager } from './src/session-manager.js';
import { CommandRouter } from './src/command-router.js';

// Global error handlers — prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  console.error(err.stack);
  // Stay alive — most uncaught exceptions in this app are non-fatal
  // (SDK errors, network issues, etc.). Only truly fatal errors
  // (corrupted state) would need a restart, which PM2 handles.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[WARN] Unhandled rejection:', reason);
});

const app = express();
app.use(express.json());

// Track the user's phone number (learned from first message)
let userNumber = null;

// WhatsApp reply functions — all check userNumber is known
async function reply(text) {
  if (!userNumber) {
    console.error('[server] No user number known yet — cannot send reply');
    return;
  }
  try {
    await sendMessage(userNumber, text);
  } catch (err) {
    console.error('[server] Failed to send:', err.message);
  }
}

async function replyButtons(bodyText, buttons) {
  if (!userNumber) {
    console.error('[server] No user number known yet — cannot send buttons');
    return;
  }
  try {
    await sendButtons(userNumber, bodyText, buttons);
  } catch (err) {
    console.error('[server] Failed to send buttons:', err.message);
  }
}

async function replyList(bodyText, buttonText, items, sections = null) {
  if (!userNumber) {
    console.error('[server] No user number known yet — cannot send list');
    return;
  }
  try {
    await sendList(userNumber, bodyText, buttonText, items, sections);
  } catch (err) {
    console.error('[server] Failed to send list:', err.message);
  }
}

// Core: session manager sends output back via WhatsApp
const sessionManager = new SessionManager(reply, replyButtons, replyList);
const commandRouter = new CommandRouter(sessionManager, replyList);

// Health check
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'wa-claude',
    engine: 'claude-agent-sdk',
    uptime: process.uptime(),
    activeProject: sessionManager.activeProject,
    sessions: sessionManager.sessions.size,
    model: config.claude.model,
    permissionMode: config.claude.permissionMode,
  });
});

// Mount webhook routes
app.use(webhook);

// Wire up incoming message handler
webhook.onMessage = async ({ from, text, buttonReplyId }) => {
  const displayText = text?.slice(0, 80) || `[button: ${buttonReplyId}]`;
  console.log(`[server] Message from ${from}: ${displayText}`);

  // Remember the user's number for replies
  userNumber = from;

  // Route through command router — may return string, null, or Promise
  const response = await Promise.resolve(commandRouter.handle(text, buttonReplyId));

  // If the router returned a response, send it.
  // If null, the ClaudeSession events will send output when ready.
  if (response) {
    await reply(response);
  }
};

app.listen(config.port, () => {
  console.log(`[wa-claude] Server running on port ${config.port}`);
  console.log(`[wa-claude] Engine: Claude Agent SDK`);
  console.log(`[wa-claude] Model: ${config.claude.model} | Permission: ${config.claude.permissionMode}`);
  console.log(`[wa-claude] Webhook URL: http://localhost:${config.port}/webhook`);
  console.log(`[wa-claude] Waiting for messages...`);
});
