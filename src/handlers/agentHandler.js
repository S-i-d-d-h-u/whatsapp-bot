// src/handlers/agentHandler.js
// ─── Maps agent dashboard actions to existing phase handler functions ──────
// The agent and vendor share the same session. This file is the bridge —
// every action here calls the EXACT same function the bot calls when a
// vendor sends a WhatsApp message. The session doesn't know or care which
// side submitted the input.

import { getSession, STATE }           from '../utils/sessionManager.js';
import { startOnboarding }             from './phase0_onboarding.js';
import {
  handleCollectPhone,
  handlePhoneInput,
  handleUPIInput,
  handleConsentReply,
  handleEligibilityReply,
}                                      from './phase1_loanCustomization.js';
import {
  handlePANSkip,
  startDocumentUpload,
}                                      from './phase2_documentUpload.js';
import {
  startVideoKYC,
  handleKYCDone,
}                                      from './phase3_videoKYC.js';
import {
  showRepaymentMenu,
  handleRepaymentSelection,
  handleRepaymentInput,
}                                      from './phase4_repayment.js';
import { sendText }                    from '../services/whatsappService.js';

// ── Main dispatcher ────────────────────────────────────────────────────────
export async function routeAgentAction(vendorPhone, action, value) {
  const from    = vendorPhone;
  const session = getSession(from);
  const state   = session.state;

  console.log(`[AGENT] phone=${from} action=${action} value=${value} state=${state}`);

  switch (action) {

    // ── Session control ──────────────────────────────────────────────────────
    case 'start_session':
      // Agent has picked up the call — begin the application
      await startOnboarding(from);
      break;

    case 'restart_session':
      await startOnboarding(from);
      break;

    // ── Phase 1: Loan Customization ──────────────────────────────────────────
    case 'begin_application':
      // Skip the onboarding intro, go straight to collecting phone
      await handleCollectPhone(from);
      break;

    case 'submit_phone':
      if (!value) throw new Error('Phone number value is required');
      await handlePhoneInput(from, value);
      break;

    case 'submit_upi':
      // value can be a UPI ID string or empty (means skip)
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

    // ── Phase 2: Document Upload ─────────────────────────────────────────────
    case 'start_documents':
      await startDocumentUpload(from);
      break;

    case 'skip_pan':
      if (state !== STATE.AWAIT_PAN) {
        throw new Error(`Cannot skip PAN — current state is ${state}, expected AWAIT_PAN`);
      }
      await handlePANSkip(from);
      break;

    // ── Phase 3: Video KYC ───────────────────────────────────────────────────
    case 'start_kyc':
      await startVideoKYC(from);
      break;

    case 'complete_kyc':
      // Agent confirms KYC was done verbally on the call
      await handleKYCDone(from);
      break;

    // ── Phase 4: Repayment ───────────────────────────────────────────────────
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
      // Used for tenure months, high months, daily amount etc.
      if (!value) throw new Error('Numeric value is required');
      await handleRepaymentInput(from, state, value);
      break;

    case 'proceed_plan':
      await handleRepaymentSelection(from, state, 'plan_proceed');
      break;

    case 'change_plan':
      await handleRepaymentSelection(from, state, 'plan_change');
      break;

    case 'change_tenure':
      await handleRepaymentSelection(from, state, 'plan_change_tenure');
      break;

    // ── Custom message ────────────────────────────────────────────────────────
    case 'send_custom_message':
      // Agent types a freeform message to send to the vendor on their behalf
      if (!value) throw new Error('Message text is required');
      await sendText(from, value);
      break;

    default:
      throw new Error(`Unknown agent action: "${action}"`);
  }
}

// ── Returns a human-readable label for each state (used by the dashboard) ──
export function getStateLabel(state) {
  const labels = {
    IDLE:               { label: 'Not started',          phase: 0, color: 'gray'   },
    ONBOARDING:         { label: 'Onboarding shown',     phase: 0, color: 'gray'   },
    COLLECT_PHONE:      { label: 'Awaiting phone number', phase: 1, color: 'blue'  },
    COLLECT_UPI:        { label: 'Awaiting UPI ID',      phase: 1, color: 'blue'   },
    CONSENT_GATE:       { label: 'Awaiting consent',     phase: 1, color: 'amber'  },
    ELIGIBILITY_RESULT: { label: 'Eligibility shown',    phase: 1, color: 'green'  },
    AWAIT_AADHAAR:      { label: 'Awaiting Aadhaar photo', phase: 2, color: 'blue' },
    AWAIT_PAN:          { label: 'Awaiting PAN / skip',  phase: 2, color: 'blue'   },
    AWAIT_PASSBOOK:     { label: 'Awaiting bank passbook', phase: 2, color: 'blue' },
    VIDEO_KYC:          { label: 'Video KYC pending',    phase: 3, color: 'amber'  },
    AWAITING_APPROVAL:  { label: 'Processing approval',  phase: 3, color: 'amber'  },
    REPAYMENT_MENU:     { label: 'Choosing repayment plan', phase: 4, color: 'blue'},
    MONTHLY_EMI:        { label: 'Monthly: enter tenure', phase: 4, color: 'blue'  },
    MONTHLY_CONFIRM:    { label: 'Monthly: confirm EMI', phase: 4, color: 'amber'  },
    SEASONAL_HIGH:      { label: 'Seasonal: high months', phase: 4, color: 'blue' },
    SEASONAL_LOW:       { label: 'Seasonal: high amount', phase: 4, color: 'blue' },
    SEASONAL_CONFIRM:   { label: 'Seasonal: confirm',    phase: 4, color: 'amber'  },
    MICRO_DAILY:        { label: 'Micro: daily amount',  phase: 4, color: 'blue'   },
    MICRO_TENURE:       { label: 'Micro: tenure months', phase: 4, color: 'blue'   },
    MICRO_CONFIRM:      { label: 'Micro: confirm',       phase: 4, color: 'amber'  },
    FINALIZED:          { label: 'Application complete', phase: 6, color: 'green'  },
  };
  return labels[state] || { label: state, phase: 0, color: 'gray' };
}
