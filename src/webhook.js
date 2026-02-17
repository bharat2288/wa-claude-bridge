// Express routes for Meta WhatsApp webhook — verification + incoming messages

import { Router } from 'express';
import config from './config.js';

const router = Router();

/**
 * GET /webhook — Meta verification handshake.
 * Meta sends hub.mode, hub.verify_token, hub.challenge.
 * We verify the token matches ours and echo back the challenge.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken) {
    console.log('[webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[webhook] Verification failed — token mismatch');
  return res.sendStatus(403);
});

/**
 * POST /webhook — Incoming messages from WhatsApp.
 * Meta sends a payload with messages array.
 * We extract the sender and text, then route to the appropriate handler.
 */
router.post('/webhook', (req, res) => {
  // Always respond 200 quickly — Meta retries on failure
  res.sendStatus(200);

  try {
    const body = req.body;

    // Drill into Meta's nested payload structure
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Skip non-message events (status updates, etc.)
    if (!value?.messages) return;

    const message = value.messages[0];
    const from = message.from; // sender phone number
    const metadata = value.metadata;

    // Sender verification — only allow whitelisted number
    if (config.allowedNumber && from !== config.allowedNumber) {
      console.warn(`[webhook] Blocked message from unauthorized sender: ${from}`);
      return;
    }

    let text = null;
    let buttonReplyId = null;

    // Handle different message types
    if (message.type === 'text') {
      text = message.text?.body;
    } else if (message.type === 'interactive') {
      // Interactive message response (button or list)
      const interactive = message.interactive;
      if (interactive?.type === 'button_reply') {
        buttonReplyId = interactive.button_reply.id;
        text = interactive.button_reply.title; // Also set text as fallback
      } else if (interactive?.type === 'list_reply') {
        buttonReplyId = interactive.list_reply.id;
        text = interactive.list_reply.title;
      }
    } else {
      console.log(`[webhook] Ignoring message type: ${message.type}`);
      return;
    }

    if (!text && !buttonReplyId) return;

    console.log(`[webhook] Message from ${from}: ${text?.slice(0, 100) || `[button: ${buttonReplyId}]`}`);

    // Emit event for the command router to handle
    if (typeof router.onMessage === 'function') {
      router.onMessage({ from, text, buttonReplyId, metadata });
    }

  } catch (err) {
    console.error('[webhook] Error processing message:', err);
  }
});

export default router;
