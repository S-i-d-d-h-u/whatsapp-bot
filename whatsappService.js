// services/whatsappService.js
// ─── All calls to the WhatsApp Cloud API ──────────────────────────────────
import fetch from 'node-fetch';
import { CONFIG } from '../../config/constants.js';

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
};

// ─── Generic sender ────────────────────────────────────────────────────────
async function sendMessage(body) {
  const res = await fetch(CONFIG.WA_API_BASE, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const data = await res.json();
  if (!res.ok) console.error('WA API error:', JSON.stringify(data));
  return data;
}

// ─── 1. Plain text ────────────────────────────────────────────────────────
export function sendText(to, text) {
  return sendMessage({ to, type: 'text', text: { body: text, preview_url: false } });
}

// ─── 2. Interactive List Message ──────────────────────────────────────────
// Displays a "tap to see options" sheet with grouped rows.
// Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-messages#list-messages
export function sendListMenu(to) {
  return sendMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🤖 Main Menu' },
      body:   { text: 'What would you like to do today? Tap the button below.' },
      footer: { text: 'Powered by WhatsApp Bot' },
      action: {
        button: 'View Options',
        sections: [
          {
            title: 'Services',
            rows: [
              { id: 'scan_document', title: '📄 Scan Document',  description: 'Extract text from an image' },
              { id: 'video_call',    title: '📹 Video Call',     description: 'Get a meeting link instantly' },
            ],
          },
          {
            title: 'Support',
            rows: [
              { id: 'help',  title: '❓ Help',  description: 'How to use this bot' },
              { id: 'about', title: 'ℹ️ About', description: 'About this service'  },
            ],
          },
        ],
      },
    },
  });
}

// ─── 3. Reply Buttons ─────────────────────────────────────────────────────
// Displays up to 3 quick-tap buttons below a message.
// Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-messages#reply-buttons
export function sendReplyButtons(to, bodyText, buttons = []) {
  return sendMessage({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(({ id, title }) => ({
          type: 'reply',
          reply: { id, title },
        })),
      },
    },
  });
}

// ─── 4. Image download helper (for OCR flow) ──────────────────────────────
// Returns a direct download URL for a media object ID.
// Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
export async function getMediaUrl(mediaId) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}` },
  });
  const { url } = await res.json();
  return url;
}

export async function downloadMedia(mediaUrl) {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}` },
  });
  const buffer = await res.buffer();
  return buffer.toString('base64');
}
