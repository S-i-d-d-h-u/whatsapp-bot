// src/handlers/phase1_loanCustomization.js  — Phase 1: Loan Customization (v3)
// Flow: DB Path choice → Phone collection → OTP → Consent → Aadhaar/Bank DB fetch → Eligibility
import { sendText, sendButtons }                       from '../services/whatsappService.js';
import { setSession, clearSession, updateSessionData,
         getSession, STATE }                            from '../utils/sessionManager.js';

const LOAN_AMOUNT = 25000;
const pause = ms  => new Promise(r => setTimeout(r, ms));

// ── Step 0: Ask Aadhaar-linked or Bank-linked ──────────────────────────────
export async function handleCollectPhone(from) {
  setSession(from, STATE.COLLECT_PHONE);
  await sendButtons(
    from,
    'Step 1 of 3 - Identity Verification\n\n' +
    'Is your mobile number linked to your:\n\n' +
    '- Aadhaar Card (UIDAI database)\n' +
    '- Bank Account (Bank database)\n\n' +
    'We will fetch your details from the correct source.',
    [
      { id: 'path_aadhaar', title: 'Aadhaar-linked' },
      { id: 'path_bank',    title: 'Bank-linked'     },
    ],
    'Verify Your Identity',
    'Tap the option that matches your registered number.'
  );
}

// Called when vendor taps Aadhaar-linked or Bank-linked
export async function handleDbPathChoice(from, buttonId) {
  const path = buttonId === 'path_aadhaar' ? 'aadhaar' : 'bank';
  updateSessionData(from, { dbPath: path });
  await sendText(from,
    'Please enter the 10-digit mobile number linked to your ' +
    (path === 'aadhaar' ? 'Aadhaar card' : 'Bank account') + '.\n\n' +
    'Example: 9876543210'
  );
  // Stay in COLLECT_PHONE — next text message will be the number
  updateSessionData(from, { awaitingPhoneEntry: true });
}

// Called when vendor types their phone number
export async function handlePhoneInput(from, text) {
  const cleaned = text.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^\d{10}$/.test(cleaned)) {
    await sendText(from,
      'That does not look like a valid 10-digit number.\n\n' +
      'Please enter your number without spaces or country code.\n' +
      'Example: 9876543210'
    );
    return;
  }
  updateSessionData(from, { phone: cleaned, awaitingPhoneEntry: false });
  await sendOtp(from, cleaned);
}

async function sendOtp(from, phone) {
  // In production: trigger real OTP via SMS gateway
  // For now: simulate with a fixed 4-digit code stored in session
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  updateSessionData(from, { otpCode: otp, otpVerified: false });
  setSession(from, STATE.COLLECT_PHONE, { otpSent: true });

  await sendText(from,
    'An OTP has been sent to ' + phone.slice(0, 2) + 'XXXXXX' + phone.slice(-2) + '.\n\n' +
    'Please enter the 4-digit OTP to verify your number.\n\n' +
    '(For demo: your OTP is ' + otp + ')'
  );
}

// Called when vendor types the OTP
export async function handleOtpInput(from, text) {
  const { data } = getSession(from);
  const entered  = text.trim();
  if (entered === data.otpCode) {
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

// ── Step 1B: Collect UPI ───────────────────────────────────────────────────
async function handleCollectUPI(from) {
  setSession(from, STATE.COLLECT_UPI);
  await sendText(from,
    'UPI ID\n\n' +
    'Please enter your UPI ID so we can set up digital repayments and cashback.\n\n' +
    'Examples: name@okaxis, 9876543210@ybl, name@paytm\n\n' +
    'If you do not have a UPI ID, type "skip" to continue.'
  );
}

export async function handleUPIInput(from, text) {
  const input = text.trim().toLowerCase();
  if (input === 'skip') {
    updateSessionData(from, { upiId: 'SKIPPED' });
    await handleConsentGate(from);
    return;
  }
  if (!/^[\w.\-]+@[a-z]+$/i.test(input)) {
    await sendText(from,
      'That does not look like a valid UPI ID.\n\n' +
      'A UPI ID looks like: name@okaxis or 9876543210@ybl\n\n' +
      'Please try again, or type "skip" to continue.'
    );
    return;
  }
  updateSessionData(from, { upiId: input });
  await handleConsentGate(from);
}

// ── Step 1C: Consent gate ──────────────────────────────────────────────────
async function handleConsentGate(from) {
  const { data } = getSession(from);
  const source   = data.dbPath === 'bank' ? 'Bank Account database' : 'Aadhaar (UIDAI) database';
  setSession(from, STATE.CONSENT_GATE);
  await sendButtons(
    from,
    'Data Consent Required\n\n' +
    'To check your eligibility, we need your permission to securely fetch your details from the ' + source + '.\n\n' +
    'What we access:\n' +
    '- Your registered name\n' +
    '- Identity number (redacted)\n' +
    '- Date of birth\n' +
    '- Registered address\n\n' +
    'We will never store passwords or initiate transactions.\n\n' +
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
      'We understand your concern about privacy.\n\n' +
      'You can still apply by visiting your nearest Common Service Centre (CSC).\n\n' +
      'Type "hi" anytime to restart. Thank you!'
    );
    return;
  }
  updateSessionData(from, { consentGiven: true, loanAmount: LOAN_AMOUNT });
  await fetchDbData(from);
}

// ── Step 1D: Fetch from Aadhaar or Bank DB ─────────────────────────────────
async function fetchDbData(from) {
  const { data } = getSession(from);
  setSession(from, STATE.ELIGIBILITY_RESULT);

  await sendText(from, 'Fetching your details... please wait a moment.');
  await pause(1500);

  if (data.dbPath === 'bank') {
    // Simulate Bank DB fetch
    const bankData = {
      fetchedName:    data.bankName    || 'Ramesh Kumar',
      fetchedAccount: data.bankAccount || 'XXXX-XXXX-' + String(Math.floor(1000 + Math.random() * 9000)),
      fetchedBank:    data.bankNameStr || 'State Bank of India',
      fetchedIfsc:    data.ifsc        || 'SBIN00' + String(Math.floor(10000 + Math.random() * 89999)),
      fetchedAddress: data.address     || 'Ward 12, Sector 4, Indore, Madhya Pradesh',
      fetchSource:    'bank',
    };
    updateSessionData(from, bankData);
    await sendButtons(
      from,
      'Bank Account Details Found\n\n' +
      'Name: ' + bankData.fetchedName + '\n' +
      'Account: ' + bankData.fetchedAccount + '\n' +
      'Bank: ' + bankData.fetchedBank + '\n' +
      'IFSC: ' + bankData.fetchedIfsc + '\n\n' +
      'Are these details correct?',
      [
        { id: 'eligibility_proceed', title: 'Yes, Proceed' },
        { id: 'eligibility_exit',    title: 'No, Exit'     },
      ],
      'Bank Details Verified',
      'Your data is secure and encrypted.'
    );
  } else {
    // Simulate Aadhaar DB fetch with masked number
    const last4     = String(Math.floor(1000 + Math.random() * 9000));
    const aadhaarData = {
      fetchedName:    data.name       || 'Ramesh Kumar',
      fetchedAadhaar: 'XXXX-XXXX-' + last4,
      aadhaarLast4:   last4,
      fetchedDob:     data.dob        || '15-Aug-1985',
      fetchedAddress: data.address    || 'Ward 12, Sector 4, Indore, Madhya Pradesh',
      fetchSource:    'aadhaar',
    };
    updateSessionData(from, aadhaarData);
    await sendButtons(
      from,
      'Aadhaar Details Found\n\n' +
      'Name: ' + aadhaarData.fetchedName + '\n' +
      'Aadhaar: ' + aadhaarData.fetchedAadhaar + '\n' +
      'DOB: ' + aadhaarData.fetchedDob + '\n' +
      'Address: ' + aadhaarData.fetchedAddress + '\n\n' +
      'Are these details correct?',
      [
        { id: 'eligibility_proceed', title: 'Yes, Proceed' },
        { id: 'eligibility_exit',    title: 'No, Exit'     },
      ],
      'Aadhaar Details Verified',
      'Aadhaar number is masked for your privacy.'
    );
  }
}

// ── Step 1E: Eligibility result ────────────────────────────────────────────
export async function handleEligibilityReply(from, buttonId) {
  if (buttonId === 'eligibility_exit') {
    clearSession(from);
    await sendText(from,
      'No problem! Type "hi" anytime to continue your application. Goodbye!'
    );
    return;
  }
  // Proceed to eligibility confirmation
  await showEligibilityResult(from);
}

async function showEligibilityResult(from) {
  setSession(from, STATE.ELIGIBILITY_RESULT);
  await sendText(from, 'Checking your loan eligibility...');
  await pause(1000);
  await sendButtons(
    from,
    'Congratulations!\n\n' +
    'Based on your profile, you are eligible for:\n\n' +
    'Loan Amount: Rs.25,000\n\n' +
    'Loan Details:\n' +
    '- Interest Rate: 7% p.a. (with subsidy)\n' +
    '- Tenure: Flexible (3 to 12 months)\n' +
    '- Processing Fee: Rs.0\n' +
    '- Cashback on digital repayments: Yes\n\n' +
    'Would you like to proceed with the application?',
    [
      { id: 'eligibility_proceed', title: 'Proceed' },
      { id: 'eligibility_exit',    title: 'Exit'     },
    ],
    'Your Loan Eligibility Result',
    'This offer is valid for 24 hours.'
  );
}

// Called from eligibility_proceed after showing result
export async function handleFinalEligibilityProceed(from) {
  const { startDocumentUpload } = await import('./phase2_documentUpload.js');
  await startDocumentUpload(from);
}
