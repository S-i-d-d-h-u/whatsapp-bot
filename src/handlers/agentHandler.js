// src/handlers/agentHandler.js  — v2 agent action dispatcher
import { getSession, STATE }           from '../utils/sessionManager.js';
import { startOnboarding }             from './phase0_onboarding.js';
import {
  handleCollectPhone, handlePhoneInput, handleUPIInput,
  handleConsentReply, handleEligibilityReply,
}                                      from './phase1_loanCustomization.js';
import { handlePANSkip, startDocumentUpload } from './phase2_documentUpload.js';
import { startVideoKYC, handleKYCDone }       from './phase3_videoKYC.js';
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
    case 'submit_phone':
      if (!value) throw new Error('Phone value required');
      await handlePhoneInput(from, value);
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
    case 'exit_eligibility':
      await handleEligibilityReply(from, 'eligibility_exit');
      break;
    case 'start_documents':
      await startDocumentUpload(from);
      break;
    case 'skip_pan':
      await handlePANSkip(from);
      break;
    case 'start_kyc':
      await startVideoKYC(from);
      break;
    case 'complete_kyc':
      await handleKYCDone(from);
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
