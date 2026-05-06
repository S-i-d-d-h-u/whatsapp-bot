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

import { startOnboarding, showMoreLanguages,
         handleLanguageSelect,
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
         handleKYCTextReminder,
         handleKYCVideoUpload }           from './phase4_videoKYC.js';
import { handleRepaymentSelection,
         handleRepaymentInput,
         showRepaymentMenu }              from './phase4_repayment.js';
import { handleSupportSelection,
         handleFinalizedText }            from './phase6_finalization.js';
import {
  soloStart, soloHandlePhone, soloHandlePhoneConfirm, soloHandleOtp, soloHandleConsent,
  soloHandleDbConfirm, soloHandleOVD, soloHandleOVDConfirm,
  soloHandleOVDCorrection, soloHandleQR, soloHandleQRConfirm,
  soloHandleQRCorrection, soloHandleRefs, soloHandleFinancialConsent,
  soloHandleLoanAmount, soloHandleKYCVideo, soloHandleRepaySelect,
  soloHandleMicroRate, soloHandlePlanConfirm,
}                                          from './soloFlow.js';

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

    if (type === 'image' || type === 'document' || type === 'video') {
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
   case STATE.COLLECT_PHONE: {
      const { data } = getSession(from);
      if (data.soloFlow) {
        await soloHandlePhone(from, text);
      } else if (data.otpSent && !data.otpVerified) {
        if (text.toLowerCase() === 'resend') {
          await handlePhoneInput(from, data.phone || text);
        } else {
          await handleOtpInput(from, text);
        }
      } else {
        await handlePhoneInput(from, text);
      }
      break;
    }
 case STATE.AWAIT_OTP: {
      const { data: otpData } = getSession(from);
      if (otpData.soloFlow) {
        await soloHandleOtp(from, text);
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
    case STATE.PROFILING_REFS: {
      const { data: refsData } = getSession(from);
      if (refsData.soloFlow) {
        await soloHandleRefs(from, text);
      } else {
        await handleReferencesInput(from, text);
      }
      break;
    }

    case STATE.PROFILING_FINANCE: {
      const { data: finData } = getSession(from);
      if (!finData.soloFlow) await sendText(from, 'Please tap one of the buttons above to consent to the financial check.');
      break;
    }

    case STATE.LOAN_SELECTION: {
      const { data: loanData } = getSession(from);
      if (loanData.soloFlow) {
        await soloHandleLoanAmount(from, text);
      } else {
        await handleLoanAmountInput(from, text);
      }
      break;
    }

    // Solo flow text states
    case STATE.SOLO_OVD_CORRECT:
      await soloHandleOVDCorrection(from, text);
      break;
    case STATE.SOLO_QR_CORRECT:
      await soloHandleQRCorrection(from, text);
      break;
    case STATE.SOLO_MICRO_RATE:
      await soloHandleMicroRate(from, text);
      break;

    // Phase 4 — KYC pending; remind user
    case STATE.KYC_READINESS:
    case STATE.VIDEO_KYC:
    case STATE.AWAIT_KYC_VIDEO:
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

  // ── Solo flow buttons ─────────────────────────────────────────────────────
 // ── Language selection ────────────────────────────────────────────────────
  if (buttonId === 'lang_more') { await showMoreLanguages(from); return; }
  if (buttonId.startsWith('lang_')) { await handleLanguageSelect(from, buttonId); return; }

  if (buttonId === 'solo_phone_yes'   || buttonId === 'solo_phone_no')   { await soloHandlePhoneConfirm(from, buttonId); return; }
  if (buttonId === 'solo_consent_yes' || buttonId === 'solo_consent_no') { await soloHandleConsent(from, buttonId); return; }
  if (buttonId === 'solo_db_yes'      || buttonId === 'solo_db_no')      { await soloHandleDbConfirm(from, buttonId); return; }
  if (buttonId === 'solo_ovd_yes'     || buttonId === 'solo_ovd_no')     { await soloHandleOVDConfirm(from, buttonId); return; }
  if (buttonId === 'solo_qr_yes'      || buttonId === 'solo_qr_no')      { await soloHandleQRConfirm(from, buttonId); return; }
  if (buttonId === 'solo_finance_yes' || buttonId === 'solo_finance_no') { await soloHandleFinancialConsent(from, buttonId); return; }
  if (buttonId === 'solo_repay_fixed' || buttonId === 'solo_repay_micro'){ await soloHandleRepaySelect(from, buttonId); return; }
  if (buttonId === 'solo_plan_confirm'|| buttonId === 'solo_plan_change') { await soloHandlePlanConfirm(from, buttonId); return; }

  // ── Phase 0: Onboarding ──────────────────────────────────────────────────
  if (buttonId === 'onboard_yes' || buttonId === 'onboard_no' || buttonId === 'onboard_call' || buttonId === 'onboard_self') {
    await handleOnboardingReply(from, buttonId);
    return;
  }

  // ── Phase 1: DB path choice (Aadhaar-linked vs Bank-linked) ────────────
  // path_aadhaar/path_bank removed — bank-only flow, handleCollectPhone handles it directly

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
    case STATE.AWAIT_AADHAAR: {
      const { data: ovdData } = getSession(from);
      if (ovdData.soloFlow) {
        await soloHandleOVD(from, mediaObject);
      } else {
        await handleAadhaarUpload(from, mediaObject);
      }
      break;
    }
    case STATE.AWAIT_PAN:
      await handlePANUpload(from, mediaObject);
      break;
    case STATE.AWAIT_PASSBOOK:
      await handlePassbookUpload(from, mediaObject);
      break;
    case STATE.AWAIT_QR: {
      const { data: qrData } = getSession(from);
      if (qrData.soloFlow) {
        await soloHandleQR(from, mediaObject);
      } else {
        await handleQRUpload(from, mediaObject);
      }
      break;
    }
    case STATE.AWAIT_KYC_VIDEO: {
      const { data: kycData } = getSession(from);
      if (kycData.soloFlow) {
        await soloHandleKYCVideo(from, mediaObject);
      } else {
        await handleKYCVideoUpload(from, mediaObject);
      }
      break;
    }
    default:
      await sendText(from,
        `I received your file, but I'm not expecting a document right now.\n\n` +
        `Type *"hi"* to return to the main menu.`
      );
  }
}
