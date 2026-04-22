// src/handlers/messageRouter.js
// ─── Central State Machine Engine ─────────────────────────────────────────
//
// Every incoming WhatsApp message flows through here.
// Steps:
//   1. ACK with 200 immediately (Meta will retry if no fast response)
//   2. Parse message type: text | interactive | image | document
//   3. Look up current user state from sessionManager
//   4. Dispatch to the correct phase handler
//
// BUGS FIXED vs previous version:
//   • plan_proceed / plan_change routing was missing (plan_ prefix not checked)
//   • MONTHLY_CONFIRM / SEASONAL_CONFIRM / MICRO_CONFIRM text not handled
//     (users sending text on a confirm screen were wrongly reset to onboarding)
//   • STATE.FINALIZED text routed to handleFinalizedText (not default restart)

import { getSession, STATE }    from '../utils/sessionManager.js';
import { sendText }             from '../services/whatsappService.js';

import { startOnboarding,
         handleOnboardingReply }          from './phase0_onboarding.js';
import { handlePhoneInput,
         handleDbPathChoice,
         handleOtpInput,
         handleUPIInput,
         handleConsentReply,
         handleEligibilityReply,
         handleFinalEligibilityProceed }  from './phase1_loanCustomization.js';
import { handleAadhaarUpload,
         handlePANUpload,
         handlePANSkip,
         handlePassbookUpload,
         handleQRUpload,
         handleQRSkip,
         remindToUploadDocument }         from './phase2_documentUpload.js';
import { handleReferencesInput,
         handleFinancialConsentReply,
         handleLoanAmountInput,
         handleLoanConfirm }              from './phase3_profiling.js';
import { handleKycVendorReady,
         handleKycVendorNotReady,
         handleKYCReady,
         handleKYCDone,
         handleKYCRetry,
         handleKYCHelp,
         handleKYCTextReminder }          from './phase4_videoKYC.js';
import { handleRepaymentSelection,
         handleRepaymentInput,
         showRepaymentMenu }              from './phase4_repayment.js';
import { handleSupportSelection,
         handleFinalizedText }            from './phase6_finalization.js';

// ── Universal restart keywords ─────────────────────────────────────────────
const RESTART_WORDS = new Set(['hi','hello','hey','start','restart','menu','namaste','julley']);

// ══════════════════════════════════════════════════════════════════════════
// WEBHOOK ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════
export async function routeMessage(req, res) {
  res.sendStatus(200); // Always ACK first

  try {
    const value   = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return; // Status updates, read receipts — ignore

    const from  = message.from;
    const type  = message.type;
    const { state } = getSession(from);

    console.log(`[${type}] from=${from} state=${state}`);

    if (type === 'image' || type === 'document') {
      await handleMediaMessage(from, state, message[type]);
      return;
    }
    if (type === 'interactive') {
      const reply = message.interactive.button_reply || message.interactive.list_reply;
      await handleButtonMessage(from, state, reply?.id);
      return;
    }
    if (type === 'text') {
      await handleTextMessage(from, state, message.text.body?.trim() || '');
      return;
    }

    await sendText(from,
      `I can only receive text messages, photos, and PDF files.\nType *"hi"* to return to the menu.`
    );
  } catch (err) {
    console.error('[routeMessage error]', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TEXT ROUTER
// ══════════════════════════════════════════════════════════════════════════
async function handleTextMessage(from, state, text) {
  const lower = text.toLowerCase().trim();

  // Universal restart — works from any state
  if (RESTART_WORDS.has(lower)) {
    await startOnboarding(from);
    return;
  }

  switch (state) {
    // Phase 1 — text input states
    case STATE.COLLECT_PHONE: {
      const { data } = getSession(from);
      if (data.otpSent && !data.otpVerified) {
        // Vendor is typing their OTP
        if (text.toLowerCase() === 'resend') {
          await handlePhoneInput(from, data.phone || text);
        } else {
          await handleOtpInput(from, text);
        }
      } else if (data.awaitingPhoneEntry || data.dbPath) {
        // Vendor is typing their phone number
        await handlePhoneInput(from, text);
      } else {
        // Default — ask for phone
        await handlePhoneInput(from, text);
      }
      break;
    }

    case STATE.COLLECT_UPI:
      await handleUPIInput(from, text);
      break;

    // Phase 2 — media expected; remind if text received
    case STATE.AWAIT_AADHAAR:
    case STATE.AWAIT_PAN:
    case STATE.AWAIT_PASSBOOK:
    case STATE.AWAIT_QR:
      await remindToUploadDocument(from, state);
      break;

    // Phase 3 — Profiling: references and financial consent
    case STATE.PROFILING_REFS:
      await handleReferencesInput(from, text);
      break;

    case STATE.PROFILING_FINANCE:
      await sendText(from, 'Please tap one of the buttons above to consent to the financial check.');
      break;

    case STATE.LOAN_SELECTION:
      await handleLoanAmountInput(from, text);
      break;

    // Phase 4 — KYC pending; remind user
    case STATE.KYC_READINESS:
    case STATE.VIDEO_KYC:
    case STATE.AWAITING_APPROVAL:
      await handleKYCTextReminder(from);
      break;

    // Phase 4 — numeric inputs for repayment calculations
    case STATE.MONTHLY_EMI:
    case STATE.SEASONAL_HIGH:
    case STATE.SEASONAL_LOW:
    case STATE.MICRO_DAILY:
    case STATE.MICRO_TENURE:
      await handleRepaymentInput(from, state, text);
      break;

    // FIX: Confirm screens — user sends text instead of tapping button
    // Gently remind them to tap one of the buttons shown above
    case STATE.MONTHLY_CONFIRM:
    case STATE.SEASONAL_CONFIRM:
    case STATE.MICRO_CONFIRM:
      await sendText(from,
        `Please tap one of the buttons above to *Proceed with Plan* or *Start Over*.\n\n` +
        `_(Type *"menu"* if you'd like to choose a different repayment plan.)_`
      );
      break;

    // Phase 4 — repayment menu shown, waiting for list selection
    case STATE.REPAYMENT_MENU:
      await sendText(from,
        `Please tap *"View Plans"* above to choose your repayment plan.\n\n` +
        `_(Type *"menu"* to see the options again.)_`
      );
      break;

    // Phase 6 — finalized, re-entry guard
    case STATE.FINALIZED:
      await handleFinalizedText(from, text);
      break;

    // Default — IDLE or unknown state → start onboarding
    default:
      await startOnboarding(from);
      break;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// BUTTON / LIST REPLY ROUTER
// ══════════════════════════════════════════════════════════════════════════
async function handleButtonMessage(from, state, buttonId) {
  if (!buttonId) return;

 // ── Phase 0: Onboarding ──────────────────────────────────────────────────
  if (buttonId === 'onboard_yes' || buttonId === 'onboard_no' || buttonId === 'onboard_call') {
    await handleOnboardingReply(from, buttonId);
    return;
  }

  // ── Phase 1: DB path choice (Aadhaar-linked vs Bank-linked) ────────────
  if (buttonId === 'path_aadhaar' || buttonId === 'path_bank') {
    await handleDbPathChoice(from, buttonId);
    return;
  }

  // ── Phase 1: Consent + Eligibility ──────────────────────────────────────
  if (buttonId === 'consent_yes' || buttonId === 'consent_no') {
    await handleConsentReply(from, buttonId);
    return;
  }
  if (buttonId === 'eligibility_proceed' || buttonId === 'eligibility_exit') {
    if (state === STATE.ELIGIBILITY_RESULT && buttonId === 'eligibility_proceed') {
      await handleFinalEligibilityProceed(from);
    } else {
      await handleEligibilityReply(from, buttonId);
    }
    return;
  }

  // ── Phase 2: PAN skip ────────────────────────────────────────────────────
  if (buttonId === 'pan_skip') {
    if (state === STATE.AWAIT_PAN) {
      await handlePANSkip(from);
    } else {
      await sendText(from, `That option is not available right now. Type *"hi"* to restart.`);
    }
    return;
  }

  // ── Phase 2: QR skip ─────────────────────────────────────────────────────
  if (buttonId === 'qr_skip') { await handleQRSkip(from); return; }

  // ── Phase 3: Profiling — financial consent + loan confirm ──────────────────
  if (buttonId === 'finance_yes' || buttonId === 'finance_no') {
    await handleFinancialConsentReply(from, buttonId);
    return;
  }
  if (buttonId === 'loan_confirm' || buttonId === 'loan_change') {
    await handleLoanConfirm(from, buttonId);
    return;
  }

  // ── Phase 4: KYC readiness + flow ─────────────────────────────────────────
  if (buttonId === 'kyc_vendor_ready') { await handleKycVendorReady(from);    return; }
  if (buttonId === 'kyc_vendor_later') { await handleKycVendorNotReady(from); return; }
  if (buttonId === 'kyc_ready')  { await handleKYCReady(from); return; }
  if (buttonId === 'kyc_done')  { await handleKYCDone(from);  return; }
  if (buttonId === 'kyc_retry') { await handleKYCRetry(from); return; }
  if (buttonId === 'kyc_help')  { await handleKYCHelp(from);  return; }

  // ── Phase 4/5: Repayment plan selections + confirm buttons ───────────────
  // FIX: plan_ prefix was missing — plan_proceed, plan_change, plan_change_tenure
  //      were all falling through to the fallback and being silently dropped.
  if (buttonId.startsWith('repay_') || buttonId.startsWith('plan_')) {
    await handleRepaymentSelection(from, state, buttonId);
    return;
  }

  // ── Phase 6: Post-finalization support menu ───────────────────────────────
  if (buttonId.startsWith('support_') || buttonId.startsWith('new_app_')) {
    await handleSupportSelection(from, buttonId);
    return;
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  await sendText(from,
    `I didn't recognise that option.\nType *"hi"* to return to the main menu.`
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MEDIA ROUTER
// ══════════════════════════════════════════════════════════════════════════
async function handleMediaMessage(from, state, mediaObject) {
  switch (state) {
    case STATE.AWAIT_AADHAAR:
      await handleAadhaarUpload(from, mediaObject);
      break;
    case STATE.AWAIT_PAN:
      await handlePANUpload(from, mediaObject);
      break;
    case STATE.AWAIT_PASSBOOK:
      await handlePassbookUpload(from, mediaObject);
      break;
    case STATE.AWAIT_QR:
      await handleQRUpload(from, mediaObject);
      break;
    default:
      await sendText(from,
        `I received your file, but I'm not expecting a document right now.\n\n` +
        `Type *"hi"* to return to the main menu.`
      );
  }
}
