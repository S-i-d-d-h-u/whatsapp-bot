// src/handlers/agentHandler.js  — v2 agent action dispatcher
import { getSession, STATE }           from '../utils/sessionManager.js';
import { startOnboarding }             from './phase0_onboarding.js';
import {
  handleCollectPhone, handlePhoneInput, handleDbPathChoice,
  handleOtpInput, handleUPIInput, sendOtpToVendor,
  handleConsentReply, handleEligibilityReply, handleFinalEligibilityProceed,
}                                      from './phase1_loanCustomization.js';
import { handlePANSkip, startDocumentUpload,
         requestPassbook, requestQRCode,
         agentApproveDocument, agentRetryDocument } from './phase2_documentUpload.js';
import { startProfiling, askFinancialConsent,
         handleFinancialConsentReply }        from './phase3_profiling.js';
import { askKycReadiness, startVideoKYC,
         handleKYCDone, agentApproveKYC }      from './phase4_videoKYC.js';
import {
  showRepaymentMenu, handleRepaymentSelection, handleRepaymentInput,
}                                      from './phase4_repayment.js';
import { sendText }                    from '../services/whatsappService.js';

export async function routeAgentAction(vendorPhone, action, value) {
  const from  = vendorPhone;
  const state = getSession(from).state;
  console.log('[AGENT] phone=' + from + ' action=' + action + ' value=' + value + ' state=' + state);

  switch (action) {
    case 'start_session':
      await startOnboarding(from);
      break;
    case 'begin_application':
      // Notify vendor an agent has joined
      await sendText(from, 'An agent has joined to assist you with your PM SVANidhi application. They will guide you through each step.');
      await handleCollectPhone(from);
      break;
    case 'restart_session':
      await startOnboarding(from);
      break;
    case 'select_db_path':
      if (!value) throw new Error('Path required: aadhaar or bank');
      await handleDbPathChoice(from, value === 'aadhaar' ? 'path_aadhaar' : 'path_bank');
      break;
    case 'submit_phone':
      if (!value) throw new Error('Phone value required');
      await sendOtpToVendor(from, value);
      break;
    case 'verify_otp':
      if (!value) throw new Error('OTP value required');
      await handleOtpInput(from, value);
      break;
    case 'fetch_aadhaar_data':
      await handleDbPathChoice(from, 'path_aadhaar');
      break;
    case 'fetch_bank_data':
      await handleDbPathChoice(from, 'path_bank');
      break;
    case 'submit_upi':
      await handleUPIInput(from, value || 'skip');
      break;
    case 'skip_upi':
      await handleUPIInput(from, 'skip');
      break;
    case 'give_consent':
      await handleConsentReply(from, 'consent_yes');
      break;
    case 'decline_consent':
      await handleConsentReply(from, 'consent_no');
      break;
    case 'proceed_eligibility':
      await handleEligibilityReply(from, 'eligibility_proceed');
      break;
    case 'proceed_final_eligibility':
      await handleFinalEligibilityProceed(from);
      break;
    case 'exit_eligibility':
      await handleEligibilityReply(from, 'eligibility_exit');
      break;
    case 'start_documents':
      await startDocumentUpload(from);
      break;
    case 'skip_pan':
      await handlePANSkip(from);
      break;
    case 'request_passbook':
      await requestPassbook(from);
      break;
    case 'request_qr':
      await requestQRCode(from);
      break;
    case 'approve_document': {
      // value = JSON string: { docKey, fields }
      if (!value) throw new Error('approve_document requires {docKey, fields}');
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      await agentApproveDocument(from, parsed.docKey, parsed.fields || {});
      break;
    }
    case 'retry_document': {
      if (!value) throw new Error('retry_document requires docKey');
      const docKey = typeof value === 'string' ? value : value.docKey;
      await agentRetryDocument(from, docKey);
      break;
    }
    case 'start_profiling':
      await startProfiling(from);
      break;
    case 'save_references': {
      // value = JSON: { ref1Name, ref1Phone, ref2Name, ref2Phone }
      const refs = typeof value === 'string' ? JSON.parse(value) : value;
      const { updateSessionData } = await import('../utils/sessionManager.js');
      updateSessionData(from, refs);
      const { askFinancialConsent: afc } = await import('./phase3_profiling.js');
      await afc(from);
      break;
    }
    case 'financial_consent':
      await handleFinancialConsentReply(from, value === 'yes' ? 'finance_yes' : 'finance_no');
      break;
    case 'set_loan_amount': {
      const { handleLoanAmountInput } = await import('./phase3_profiling.js');
      if (!value) throw new Error('loan amount required');
      await handleLoanAmountInput(from, String(value));
      break;
    }
    case 'confirm_loan':
      { const { handleLoanConfirm } = await import('./phase3_profiling.js'); await handleLoanConfirm(from, 'loan_confirm'); }
      break;
    case 'start_kyc_readiness':
      await askKycReadiness(from);
      break;
    case 'start_kyc':
      await startVideoKYC(from);
      break;
    case 'complete_kyc':
      await handleKYCDone(from);
      break;
    case 'approve_kyc':
      await agentApproveKYC(from);
      break;
    case 'show_repayment_menu':
      await showRepaymentMenu(from);
      break;
    case 'select_monthly':
      await handleRepaymentSelection(from, state, 'repay_monthly');
      break;
    case 'select_seasonal':
      await handleRepaymentSelection(from, state, 'repay_seasonal');
      break;
    case 'select_micro':
      await handleRepaymentSelection(from, state, 'repay_micro');
      break;
    case 'submit_repayment_number':
      if (!value) throw new Error('Value required');
      await handleRepaymentInput(from, state, value);
      break;
    case 'proceed_plan':
      await handleRepaymentSelection(from, state, 'plan_proceed');
      break;
    case 'change_plan':
      await handleRepaymentSelection(from, state, 'plan_change');
      break;
    case 'send_custom_message':
      if (!value) throw new Error('Message required');
      await sendText(from, value);
      break;
    default:
      throw new Error('Unknown action: ' + action);
  }
}

export function getStateLabel(state) {
  const labels = {
    IDLE: { label: 'Not started', phase: 0, color: 'gray' },
    ONBOARDING: { label: 'Onboarding shown', phase: 0, color: 'gray' },
    COLLECT_PHONE: { label: 'Awaiting phone', phase: 1, color: 'blue' },
    COLLECT_UPI: { label: 'Awaiting UPI', phase: 1, color: 'blue' },
    CONSENT_GATE: { label: 'Awaiting consent', phase: 1, color: 'amber' },
    ELIGIBILITY_RESULT: { label: 'Eligibility shown', phase: 1, color: 'green' },
    AWAIT_AADHAAR: { label: 'Awaiting Aadhaar', phase: 2, color: 'blue' },
    AWAIT_PAN: { label: 'Awaiting PAN', phase: 2, color: 'blue' },
    AWAIT_PASSBOOK: { label: 'Awaiting passbook', phase: 2, color: 'blue' },
    AWAIT_QR:       { label: 'Awaiting QR code',  phase: 2, color: 'blue' },
    PROFILING_REFS:    { label: 'Collecting references', phase: 3, color: 'blue'  },
    PROFILING_FINANCE: { label: 'Financial consent',     phase: 3, color: 'amber' },
    LOAN_SELECTION:    { label: 'Loan amount input',     phase: 3, color: 'blue'  },
    KYC_READINESS:     { label: 'KYC readiness check',  phase: 4, color: 'amber' },
    AWAIT_KYC_VIDEO:   { label: 'Awaiting KYC video',    phase: 4, color: 'blue'  },
    VIDEO_KYC: { label: 'Video KYC pending', phase: 4, color: 'amber' },
    AWAITING_APPROVAL: { label: 'Processing', phase: 4, color: 'amber' },
    REPAYMENT_MENU: { label: 'Repayment menu', phase: 5, color: 'blue' },
    MONTHLY_EMI: { label: 'Monthly EMI input', phase: 5, color: 'blue' },
    MONTHLY_CONFIRM: { label: 'Monthly confirm', phase: 5, color: 'amber' },
    SEASONAL_HIGH: { label: 'Seasonal high months', phase: 5, color: 'blue' },
    SEASONAL_LOW: { label: 'Seasonal amount', phase: 5, color: 'blue' },
    SEASONAL_CONFIRM: { label: 'Seasonal confirm', phase: 5, color: 'amber' },
    MICRO_DAILY: { label: 'Micro daily input', phase: 5, color: 'blue' },
    MICRO_TENURE: { label: 'Micro tenure', phase: 5, color: 'blue' },
    MICRO_CONFIRM: { label: 'Micro confirm', phase: 5, color: 'amber' },
    FINALIZED: { label: 'Application complete', phase: 6, color: 'green' },
  };
  return labels[state] || { label: state, phase: 0, color: 'gray' };
}
