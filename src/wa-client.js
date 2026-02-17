// WhatsApp Cloud API client — sends messages via Meta's Graph API

import config from './config.js';

const { accessToken, phoneNumberId, apiVersion } = config.whatsapp;
const BASE_URL = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

/**
 * Send a text message to a WhatsApp number.
 * @param {string} to - Recipient phone number (with country code, no +)
 * @param {string} text - Message body
 */
export async function sendMessage(to, text) {
  // WhatsApp has a ~4096 char limit per message — split if needed
  const chunks = splitMessage(text, config.output.maxMessageLength);

  for (const chunk of chunks) {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: chunk },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[wa-client] Send failed:', response.status, err);
      throw new Error(`WhatsApp send failed: ${response.status}`);
    }
  }
}

/**
 * Send an interactive button message.
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Main message text
 * @param {Array<{id: string, title: string}>} buttons - Up to 3 buttons
 */
export async function sendButtons(to, bodyText, buttons) {
  if (buttons.length > 3) {
    throw new Error('WhatsApp supports max 3 buttons per message');
  }

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map(btn => ({
            type: 'reply',
            reply: {
              id: btn.id,
              title: btn.title,
            },
          })),
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('[wa-client] Send buttons failed:', response.status, err);
    throw new Error(`WhatsApp send failed: ${response.status}`);
  }
}

/**
 * Send an interactive list message (dropdown menu).
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Main message text
 * @param {string} buttonText - Text on the list button (e.g., "Select Project")
 * @param {Array<{id: string, title: string, description?: string}>} items - Items to display
 * @param {Array<{title: string, items: Array}>} sections - Optional pre-grouped sections (overrides auto-sectioning)
 */
export async function sendList(to, bodyText, buttonText, items, sections = null) {
  // If sections are provided, use them directly
  let finalSections = sections;

  if (!finalSections) {
    // WhatsApp enforces max 10 total rows across all sections
    const capped = items.slice(0, 10);

    finalSections = [{
      title: 'Items',
      rows: capped.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
      })),
    }];
  }

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections: finalSections,
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('[wa-client] Send list failed:', response.status, err);
    throw new Error(`WhatsApp send failed: ${response.status}`);
  }
}

/**
 * Split a long message into chunks at line boundaries.
 */
function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find last newline before maxLen
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1 || splitAt < maxLen * 0.5) {
      // No good line break — split at maxLen
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }

  return chunks;
}
