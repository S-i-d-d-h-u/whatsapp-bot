// src/handlers/phase1_loanCustomization.js — Phase 1: Identity Verification
// Flow: Phone (bank-linked) → OTP → Consent → Bank DB fetch → Proceed to docs
import { sendText, sendButtons }            from '../services/whatsappService.js';
import { setSession, clearSession,
         updateSessionData, getSession,
         STATE }                            from '../utils/sessionManager.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// ── Step 1: Ask for bank-linked phone number ───────────────────────────────
export async function handleCollectPhone(from) {
  setSession(from, STATE.COLLECT_PHONE);
  await sendText(from,
    'Step 1 of 3 - Identity Verification\n\n' +
    'Please enter the 10-digit mobile number linked to your Bank Account.\n\n' +
    'We will send a one-time password (OTP) to verify your number.\n\n' +
    'Example: 9876543210'
  );
  updateSessionData(from, { dbPath: 'bank', awaitingPhoneEntry: true });
}

// Stub kept for router compatibility — no longer used
export async function handleDbPathChoice(from, buttonId) {
  await handleCollectPhone(from);
}

// ── Step 2: Phone number input ────────────────────────────────────────────
export async function handlePhoneInput(from, text) {
  const cleaned = text.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^\d{10}$/.test(cleaned)) {
    await sendText(from,
      'That does not look like a valid 10-digit number.\n\n' +
      'Please enter your bank-linked number without spaces or country code.\n' +
      'Example: 9876543210'
    );
    return;
  }
  updateSessionData(from, { phone: cleaned, awaitingPhoneEntry: false });
  await sendOtp(from, cleaned);
}

async function sendOtp(from, phone) {
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  updateSessionData(from, { otpCode: otp, otpVerified: false });
  setSession(from, STATE.COLLECT_PHONE, { otpSent: true });
  await sendText(from,
    'An OTP has been sent to ' + phone.slice(0, 2) + 'XXXXXX' + phone.slice(-2) + '.\n\n' +
    'Please enter the 4-digit OTP to verify your number.\n\n' +
    '(For demo: your OTP is ' + otp + ')'
  );
}

// ── Step 3: OTP verification ──────────────────────────────────────────────
export async function handleOtpInput(from, text) {
  const { data } = getSession(from);
  if (text.trim() === data.otpCode) {
    updateSessionData(from, { otpVerified: true });
    await handleConsentGate(from);
  } else {
    await sendText(from,
      'Incorrect OTP. Please try again.\n\n' +
      'Enter the 4-digit OTP sent to your number.\n' +
      'Type "resend" to get a new OTP.'
    );
  }
}

// Stubs for backward compat
export async function handleUPIInput(from, text) { await handleConsentGate(from); }

// ── Step 4: Data consent ──────────────────────────────────────────────────
async function handleConsentGate(from) {
  setSession(from, STATE.CONSENT_GATE);
  await sendButtons(
    from,
    'Data Consent Required\n\n' +
    'To verify your identity and check eligibility, we need permission to securely fetch your details from the Bank Account database.\n\n' +
    'What we access:\n' +
    '- Your registered name\n' +
    '- Account number (last 4 digits only)\n' +
    '- Bank name and IFSC\n\n' +
    'We will never store your password or initiate any transaction.\n\n' +
    'Do you agree to this secure data access?',
    [
      { id: 'consent_yes', title: 'I Agree'    },
      { id: 'consent_no',  title: 'I Disagree' },
    ],
    'Secure Data Access',
    'Powered by Account Aggregator Framework'
  );
}

export async function handleConsentReply(from, buttonId) {
  if (buttonId === 'consent_no') {
    clearSession(from);
    await sendText(from,
      'We understand your concern.\n\n' +
      'You can apply in person at your nearest Common Service Centre (CSC).\n\n' +
      'Type "hi" anytime to restart. Thank you!'
    );
    return;
  }
  updateSessionData(from, { consentGiven: true });
  await fetchBankData(from);
}

// ── Step 5: Fetch from Bank DB ────────────────────────────────────────────
async function fetchBankData(from) {
  const { data } = getSession(from);
  setSession(from, STATE.ELIGIBILITY_RESULT);
  await sendText(from, 'Fetching your bank details... please wait a moment.');
  await pause(1500);

  const last4    = String(Math.floor(1000 + Math.random() * 9000));
  const bankData = {
    fetchedName:    data.bankName    || 'Ramesh Kumar',
    fetchedAccount: 'XXXX-XXXX-' + last4,
    fetchedBank:    data.bankNameStr || 'State Bank of India',
    fetchedIfsc:    data.ifsc        || 'SBIN00' + String(Math.floor(10000 + Math.random() * 89999)),
    fetchedAddress: data.address     || 'Ward 12, Sector 4, Indore, Madhya Pradesh',
    fetchSource:    'bank',
  };
  updateSessionData(from, bankData);

  await sendButtons(
    from,
    'Bank Account Details Found\n\n' +
    'Name: '    + bankData.fetchedName    + '\n' +
    'Account: ' + bankData.fetchedAccount + '\n' +
    'Bank: '    + bankData.fetchedBank    + '\n' +
    'IFSC: '    + bankData.fetchedIfsc    + '\n\n' +
    'Are these details correct?',
    [
      { id: 'eligibility_proceed', title: 'Yes, Proceed' },
      { id: 'eligibility_exit',    title: 'No, Exit'     },
    ],
    'Bank Details Verified',
    'Your data is secure and encrypted.'
  );
}

// ── Step 6: Proceed to documents ──────────────────────────────────────────
export async function handleEligibilityReply(from, buttonId) {
  if (buttonId === 'eligibility_exit') {
    clearSession(from);
    await sendText(from, 'No problem! Type "hi" anytime to restart. Goodbye!');
    return;
  }
  await handleFinalEligibilityProceed(from);
}

export async function handleFinalEligibilityProceed(from) {
  const { startDocumentUpload } = await import('./phase2_documentUpload.js');
  await startDocumentUpload(from);
}
