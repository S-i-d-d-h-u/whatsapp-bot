// utils/sessionManager.js
// ─── In-memory session store (swap with Redis for production) ──────────────
// Tracks what each user is "doing" between messages so the bot
// knows e.g. that the next image they send is for OCR.

const sessions = new Map();

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const SESSION_STATES = {
  IDLE:             'IDLE',
  AWAITING_IMAGE:   'AWAITING_IMAGE',   // User chose "Scan Document", waiting for image
  CONFIRMING_CALL:  'CONFIRMING_CALL',  // User chose "Video Call", showing confirm buttons
};

export function getSession(userId) {
  const session = sessions.get(userId);
  if (!session) return { state: SESSION_STATES.IDLE, data: {} };

  // Auto-expire stale sessions
  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(userId);
    return { state: SESSION_STATES.IDLE, data: {} };
  }
  return session;
}

export function setSession(userId, state, data = {}) {
  sessions.set(userId, { state, data, updatedAt: Date.now() });
}

export function clearSession(userId) {
  sessions.delete(userId);
}
