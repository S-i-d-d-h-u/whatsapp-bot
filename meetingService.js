// services/meetingService.js
// ─── Video Call Bypass: generates an instant meeting link ─────────────────
// WhatsApp does not support native video calls via API.
// Instead, we generate a unique Jitsi Meet link (no signup/auth needed).
// Drop-in replacements: Daily.co, 100ms, Whereby, Zoom (all have REST APIs).

import { CONFIG } from '../../config/constants.js';
import crypto from 'crypto';

/**
 * generateMeetingLink
 * ─────────────────────
 * Creates a unique, hard-to-guess meeting room URL.
 * Jitsi Meet (https://meet.jit.si) is free and requires zero backend auth.
 *
 * To use Daily.co instead, replace with:
 *   POST https://api.daily.co/v1/rooms  { name, exp, privacy: 'private' }
 *   Authorization: Bearer YOUR_DAILY_API_KEY
 *
 * @returns {{ url: string, roomName: string, expiresIn: string }}
 */
export function generateMeetingLink() {
  // Generate a collision-resistant room name
  const roomName  = `wa-${crypto.randomBytes(6).toString('hex')}`;
  const url       = `${CONFIG.JITSI_BASE_URL}/${roomName}`;
  const expiresIn = '24 hours';

  return { url, roomName, expiresIn };
}

/**
 * formatMeetingMessage
 * ──────────────────────
 * Formats the meeting link as a WhatsApp-friendly message.
 */
export function formatMeetingMessage({ url, expiresIn }) {
  return [
    '📹 *Your Video Call is Ready!*',
    '',
    `🔗 *Join here:*\n${url}`,
    '',
    `⏱️ *Expires in:* ${expiresIn}`,
    '',
    '✅ Works on any device — no app install needed.',
    '📱 Share this link with the other participants.',
    '',
    '_Tip: For a private room, use the lock icon inside the call._',
  ].join('\n');
}
