// src/utils/sessionManager.js
// ─── Per-user in-memory session store ─────────────────────────────────────
// FIX: setSession always deep-merges existing data so collected fields
//      (phone, upiId, docs, etc.) are never wiped on a state transition.

const sessions    = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

// ── State enum ─────────────────────────────────────────────────────────────
export const STATE = {
  IDLE:               'IDLE',
  // Phase 0 — Onboarding
  ONBOARDING:         'ONBOARDING',
  // Phase 1 — Loan Customization
  COLLECT_PHONE:      'COLLECT_PHONE',
  COLLECT_UPI:        'COLLECT_UPI',
  CONSENT_GATE:       'CONSENT_GATE',
  ELIGIBILITY_RESULT: 'ELIGIBILITY_RESULT',
  // Phase 2 — Document Upload
  AWAIT_AADHAAR:      'AWAIT_AADHAAR',
  AWAIT_PAN:          'AWAIT_PAN',
  AWAIT_PASSBOOK:     'AWAIT_PASSBOOK',
  AWAIT_QR:           'AWAIT_QR',
  // Phase 3 — Profiling & Eligibility
  PROFILING_REFS:     'PROFILING_REFS',
  PROFILING_FINANCE:  'PROFILING_FINANCE',
  LOAN_SELECTION:     'LOAN_SELECTION',
  // Phase 4 — Video KYC
  KYC_READINESS:      'KYC_READINESS',
  AWAIT_KYC_VIDEO:    'AWAIT_KYC_VIDEO',
  VIDEO_KYC:          'VIDEO_KYC',
  AWAITING_APPROVAL:  'AWAITING_APPROVAL',
  // Phase 4 — Repayment
  REPAYMENT_MENU:     'REPAYMENT_MENU',
  MONTHLY_EMI:        'MONTHLY_EMI',
  MONTHLY_CONFIRM:    'MONTHLY_CONFIRM',
  SEASONAL_HIGH:      'SEASONAL_HIGH',
  SEASONAL_LOW:       'SEASONAL_LOW',
  SEASONAL_CONFIRM:   'SEASONAL_CONFIRM',
  MICRO_DAILY:        'MICRO_DAILY',
  MICRO_TENURE:       'MICRO_TENURE',
  MICRO_CONFIRM:      'MICRO_CONFIRM',
  // Phase 6 — Finalized
  FINALIZED:          'FINALIZED',
};

export function getSession(userId) {
  const s = sessions.get(userId);
  if (!s) return { state: STATE.IDLE, data: {} };
  if (Date.now() - s.updatedAt > SESSION_TTL) {
    sessions.delete(userId);
    return { state: STATE.IDLE, data: {} };
  }
  return s;
}

// FIX: always spreads existing.data so no field is ever lost on state change
export function setSession(userId, state, extraData = {}) {
  const existing = getSession(userId);
  sessions.set(userId, {
    state,
    data:      { ...existing.data, ...extraData },
    updatedAt: Date.now(),
  });
}

// Patch only data fields without touching state
export function updateSessionData(userId, patch) {
  const existing = getSession(userId);
  sessions.set(userId, {
    ...existing,
    data:      { ...existing.data, ...patch },
    updatedAt: Date.now(),
  });
}

export function clearSession(userId) {
  sessions.delete(userId);
}
