// phase1_loanCustomization.js — Phase 1 (v5) — minimal messages
import { sendText, sendButtons } from '../services/whatsappService.js';
import { setSession, clearSession, updateSessionData, getSession, STATE } from '../utils/sessionManager.js';
import { generateOTP, sendOTP, verifyOTP } from '../services/otpService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// Step 1: Ask for bank-linked number — one line only
export async function handleCollectPhone(from) {
  setSession(from, STATE.COLLECT_PHONE);
  await sendText(from, 'Please enter your 10-digit bank-linked mobile number.');
  updateSessionData(from, { dbPath: 'bank', awaitingPhoneEntry: true });
}

export async function handleDbPathChoice(from, buttonId) {
  await handleCollectPhone(from);
}

// Step 2: Validate phone
export async function handlePhoneInput(from, text) {
  const cleaned = text.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^\d{10}$/.test(cleaned)) {
    await sendText(from, 'Please enter a valid 10-digit number.');
    return;
  }
  updateSessionData(from, { phone: cleaned, awaitingPhoneEntry: false });
  // OTP will be sent when agent clicks "Send OTP" on dashboard
  // Store OTP now so agent can send it
const otp = generateOTP();
  updateSessionData(from, { otpCode: otp, otpExpiry: Date.now() + 5 * 60 * 1000, otpAttempts: 0, otpVerified: false, otpSent: false });
  setSession(from, STATE.COLLECT_PHONE, { otpReady: true });
}

// Called by agent action 'submit_phone' — sends OTP via SMS (call agent flow)
export async function sendOtpToVendor(from, phone) {
  const cleaned = phone.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^\d{10}$/.test(cleaned)) {
    await sendText(from, 'Please enter a valid 10-digit number.');
    return;
  }
  updateSessionData(from, { phone: cleaned });
  const otp = generateOTP();
  updateSessionData(from, {
    otpCode:     otp,
    otpExpiry:   Date.now() + 5 * 60 * 1000,
    otpAttempts: 0,
    otpVerified: false,
    otpSent:     false,
  });

  try {
    await sendOTP(cleaned, otp);  // SMS for assisted flow
    updateSessionData(from, { otpSent: true });
    await sendText(from, '🔢 An OTP has been sent to *' + cleaned + '* via SMS.\n\nPlease enter the OTP here, or your agent can enter it on their screen.');
  } catch (err) {
    console.error('[OTP SMS assisted]', err.message);
    await sendText(from, '❌ Could not send OTP. Please ask your agent to try again.');
  }
}

// Step 3: OTP input — verifies with expiry and attempt limiting
export async function handleOtpInput(from, text) {
  const { data } = getSession(from);
  const result   = verifyOTP(data, text.trim());

  if (result.valid) {
    updateSessionData(from, { otpVerified: true, otpCode: null, otpExpiry: null, otpAttempts: 0 });
    await handleConsentGate(from);
    return;
  }

  if (result.reason === 'expired') {
    updateSessionData(from, { otpCode: null, otpExpiry: null });
    await sendText(from, '⏰ OTP expired. Please ask your agent to resend it.');
    return;
  }

  const attempts = (data.otpAttempts || 0) + 1;
  updateSessionData(from, { otpAttempts: attempts });

  if (attempts >= 3) {
    updateSessionData(from, { otpCode: null, otpExpiry: null, otpAttempts: 0 });
    await sendText(from, '❌ Too many incorrect attempts. Please ask your agent to resend the OTP.');
    return;
  }

  await sendText(from, '❌ Incorrect OTP. ' + (3 - attempts) + ' attempt(s) remaining.');
}
export async function handleUPIInput(from, text) { await handleConsentGate(from); }

// Step 4: Consent — short list of what is accessed + buttons
async function handleConsentGate(from) {
  setSession(from, STATE.CONSENT_GATE);
  await sendButtons(
    from,
    'We will access:\n- Your name\n- Account number (last 4 digits)\n- Bank name & IFSC\n\nDo you agree?',
    [
      { id: 'consent_yes', title: 'Agree'    },
      { id: 'consent_no',  title: 'Disagree' },
    ],
    'Data Consent'
  );
}

export async function handleConsentReply(from, buttonId) {
  if (buttonId === 'consent_no') {
    clearSession(from);
    await sendText(from, 'Application cancelled. Send "hi" to restart.');
    return;
  }
  updateSessionData(from, { consentGiven: true });
  await fetchBankData(from);
}

// Step 5: Fetch from Bank DB — no message to vendor, only dashboard sees details
async function fetchBankData(from) {
  const { data } = getSession(from);
  setSession(from, STATE.ELIGIBILITY_RESULT);
  await pause(1500);

  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  updateSessionData(from, {
    fetchedName:    data.bankName    || 'Ramesh Kumar',
    fetchedAccount: 'XXXX-XXXX-' + last4,
    fetchedBank:    data.bankNameStr || 'State Bank of India',
    fetchedIfsc:    data.ifsc        || 'SBIN00' + String(Math.floor(10000 + Math.random() * 89999)),
    fetchedAddress: data.address     || 'Ward 12, Sector 4, Indore, Madhya Pradesh',
    fetchSource:    'bank',
  });
  // No message sent to vendor — agent confirms on dashboard
}

// Step 6: Agent confirms details → move to documents
export async function handleEligibilityReply(from, buttonId) {
  if (buttonId === 'eligibility_exit') {
    clearSession(from);
    await sendText(from, 'Send "hi" to restart.');
    return;
  }
  await handleFinalEligibilityProceed(from);
}

export async function handleFinalEligibilityProceed(from) {
  const { startDocumentUpload } = await import('./phase2_documentUpload.js');
  await startDocumentUpload(from);
}
