// src/handlers/phase1_loanCustomization.js  — Phase 1: Loan Customization
import { sendText, sendButtons }                       from '../services/whatsappService.js';
import { setSession, clearSession, updateSessionData,
         STATE }                                        from '../utils/sessionManager.js';

const LOAN_AMOUNT = 25_000;
const pause = ms  => new Promise(r => setTimeout(r, ms));

// ── Step 1A: Collect phone ─────────────────────────────────────────────────
export async function handleCollectPhone(from) {
  setSession(from, STATE.COLLECT_PHONE);
  await sendText(from,
    `✅ Great! Let's get started.\n\n` +
    `*Step 1 of 3 — Loan Eligibility*\n` +
    `───────────────────────────\n\n` +
    `📱 Please enter the *mobile number linked to your Aadhaar card or Bank Account*.\n\n` +
    `_Example: 9876543210_`
  );
}

export async function handlePhoneInput(from, text) {
  const cleaned = text.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^\d{10}$/.test(cleaned)) {
    await sendText(from,
      `⚠️ That doesn't look like a valid 10-digit number.\n\n` +
      `Please enter your number without spaces or country code.\n_Example: 9876543210_`
    );
    return;
  }
  updateSessionData(from, { phone: cleaned });
  await handleCollectUPI(from);
}

// ── Step 1B: Collect UPI ───────────────────────────────────────────────────
async function handleCollectUPI(from) {
  setSession(from, STATE.COLLECT_UPI);
  await sendText(from,
    `📲 *UPI ID*\n\n` +
    `Please enter your *UPI ID* so we can set up digital repayments and cashback.\n\n` +
    `_Examples:_ name@okaxis, 9876543210@ybl, name@paytm\n\n` +
    `If you don't have a UPI ID, type *"skip"* to continue.`
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
      `⚠️ That doesn't look like a valid UPI ID.\n\n` +
      `A UPI ID looks like: *name@okaxis* or *9876543210@ybl*\n\n` +
      `Please try again, or type *"skip"* to continue.`
    );
    return;
  }
  updateSessionData(from, { upiId: input });
  await handleConsentGate(from);
}

// ── Step 1C: Consent gate ──────────────────────────────────────────────────
async function handleConsentGate(from) {
  setSession(from, STATE.CONSENT_GATE);
  await sendButtons(
    from,
    `🔒 *Data Consent Required*\n\n` +
    `To determine your loan limit, we need to securely access your banking transaction history.\n\n` +
    `*What we access:*\n• Last 6 months account activity\n• Average monthly balance\n\n` +
    `*What we never do:*\n• Store your bank password\n• Initiate transactions\n\n` +
    `Do you consent to this secure data access?`,
    [
      { id: 'consent_yes', title: '✅ I Consent'        },
      { id: 'consent_no',  title: '❌ I Do Not Consent' },
    ],
    'Secure Data Access',
    'Powered by Account Aggregator Framework'
  );
}

export async function handleConsentReply(from, buttonId) {
  if (buttonId === 'consent_no') {
    clearSession(from);
    await sendText(from,
      `We understand. 🔐\n\n` +
      `You can still apply by visiting your nearest *Common Service Centre (CSC)*.\n\n` +
      `Type *"hi"* anytime to restart. Thank you! 🙏`
    );
    return;
  }
  updateSessionData(from, { consentGiven: true, loanAmount: LOAN_AMOUNT });
  await handleEligibilityResult(from);
}

// ── Step 1D: Eligibility result ────────────────────────────────────────────
async function handleEligibilityResult(from) {
  setSession(from, STATE.ELIGIBILITY_RESULT);
  await sendText(from, `⏳ Checking your eligibility... please wait a moment.`);
  await pause(1500);
  await sendButtons(
    from,
    `🎉 *Congratulations!*\n\n` +
    `Based on your profile, you are eligible for:\n\n` +
    `💰 *Loan Amount: ₹25,000*\n\n` +
    `*Loan Details:*\n` +
    `• Interest Rate: 7% p.a. (with subsidy)\n` +
    `• Tenure: Flexible (3–12 months)\n` +
    `• Processing Fee: ₹0\n` +
    `• Cashback on digital repayments: ✅\n\n` +
    `Would you like to proceed with the application?`,
    [
      { id: 'eligibility_proceed', title: '✅ Proceed' },
      { id: 'eligibility_exit',    title: '❌ Exit'    },
    ],
    'Your Loan Eligibility Result',
    'This offer is valid for 24 hours.'
  );
}

export async function handleEligibilityReply(from, buttonId) {
  if (buttonId === 'eligibility_exit') {
    clearSession(from);
    await sendText(from,
      `No problem! Type *"hi"* anytime to continue your application.\nGoodbye! 🙏`
    );
    return;
  }
  const { startDocumentUpload } = await import('./phase2_documentUpload.js');
  await startDocumentUpload(from);
}
