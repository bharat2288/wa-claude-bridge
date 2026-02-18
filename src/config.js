import dotenv from 'dotenv';
import { resolve } from 'path';

// Load shared .env from dev root, then project-local override
dotenv.config({ path: resolve('C:/Users/bhara/dev/.env') });
dotenv.config({ path: resolve('.env'), override: true });

export default {
  // Meta WhatsApp Cloud API credentials
  whatsapp: {
    accessToken: process.env.WA_CLAUDE_ACCESS_TOKEN,
    phoneNumberId: process.env.WA_CLAUDE_PHONE_NUMBER_ID,
    webhookVerifyToken: process.env.WA_CLAUDE_WEBHOOK_VERIFY_TOKEN,
    apiVersion: 'v21.0',
  },

  // Sender verification — only this number can interact with the bot
  allowedNumber: process.env.WA_CLAUDE_ALLOWED_NUMBER || '',

  // Project directory root
  projectRoot: 'C:\\Users\\bhara\\dev',

  // Group name → project directory overrides (for non-standard paths)
  projectOverrides: {
    // 'scholia': 'C:\\Users\\bhara\\dev\\reader3',
  },

  // Output processing thresholds
  output: {
    maxMessageLength: 4000,
    summarizeThreshold: 1500,
  },

  // Claude Agent SDK settings
  claude: {
    model: process.env.WA_CLAUDE_MODEL || 'sonnet',
    permissionMode: 'acceptEdits',
    // Tools auto-approved without relaying to WhatsApp
    allowedTools: [
      'Read', 'Write', 'Edit', 'Glob', 'Grep',
      'WebFetch', 'WebSearch', 'NotebookEdit',
    ],
    // Batched streaming interval — how often to flush text to WhatsApp (ms)
    streamBufferMs: 3000,
    // Safety limit on agentic turns per query
    maxTurns: 50,
    // Timeout for user to approve/deny a Bash command (ms) — auto-deny after this
    approvalTimeoutMs: 5 * 60 * 1000, // 5 minutes
    // Maximum wall-clock time for a single query (ms) — abort after this
    queryTimeoutMs: 10 * 60 * 1000, // 10 minutes
  },

  // Server
  port: parseInt(process.env.WA_CLAUDE_PORT || '3100', 10),
};
