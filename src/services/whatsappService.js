// src/services/whatsappService.js  — All WhatsApp Cloud API calls
import fetch from 'node-fetch';

const base    = () => `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization:  `Bearer ${process.env.WHATSAPP_TOKEN}`,
});

async function send(body) {
  const res  = await fetch(base(), { method: 'POST', headers: headers(),
                                     body: JSON.stringify({ messaging_product: 'whatsapp', ...body }) });
  const data = await res.json();
  if (!res.ok) console.error('[WA Error]', JSON.stringify(data));
  return data;
}

// ── Plain text ─────────────────────────────────────────────────────────────
export function sendText(to, text) {
  return send({ to, type: 'text', text: { body: text, preview_url: false } });
}

// ── Reply Buttons (max 3) ─────────────────────────────────────────────────
export function sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
  const interactive = {
    type:   'button',
    body:   { text: bodyText },
    action: { buttons: buttons.map(({ id, title }) => ({ type: 'reply', reply: { id, title } })) },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };
  return send({ to, type: 'interactive', interactive });
}

// ── List Message ──────────────────────────────────────────────────────────
export function sendList(to, bodyText, buttonLabel, sections, headerText = null, footerText = null) {
  const interactive = {
    type:   'list',
    body:   { text: bodyText },
    action: { button: buttonLabel, sections },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText };
  if (footerText) interactive.footer = { text: footerText };
  return send({ to, type: 'interactive', interactive });
}

// ── Media helpers (for OCR) ────────────────────────────────────────────────
export async function getMediaUrl(mediaId) {
  const res  = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
                           { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const data = await res.json();
  return data.url;
}

export async function downloadMediaAsBase64(mediaUrl) {
  const res         = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}
