// src/handlers/phase0_onboarding.js  — Phase 0: Onboarding (v3)
// Sends scheme intro image + 3-button choice
import { sendText, sendButtons, sendImage } from '../services/whatsappService.js';
import { setSession, clearSession, STATE }  from '../utils/sessionManager.js';

const AGENT_NUMBER   = process.env.AGENT_PHONE    || '880046121';
const SCHEME_IMG_URL = process.env.SCHEME_IMG_URL || '';

export async function startOnboarding(from) {
  setSession(from, STATE.ONBOARDING);

  if (SCHEME_IMG_URL) {
    await sendImage(from, SCHEME_IMG_URL,
      'PM SVANidhi — collateral-free working capital loans for street vendors.'
    ).catch(() => {});
  }

  await sendText(from,
    'Namaste! Welcome to the PM SVANidhi Support Bot.\n\n' +
    'PM SVANidhi provides:\n' +
    '- Working capital loans: Tranche 1 Rs.10,000 | Tranche 2 Rs.20,000 | Tranche 3 Rs.50,000\n' +
    '- No collateral required\n' +
    '- 7% interest subsidy on timely repayment\n' +
    '- Cashback on every digital transaction\n\n' +
    'Eligible for: street vendors, hawkers, rehri-patri vendors'
  );

  await sendButtons(
    from,
    'Your application has 3 steps:\n\n' +
    'Step 1 - Eligibility and Loan Customization\n' +
    'Step 2 - Document Upload\n' +
    'Step 3 - Video KYC\n\n' +
    'Tap "Call Agent" to speak with our team on ' + AGENT_NUMBER + '.\n' +
    'They will guide you through every step.\n\n' +
    'Or tap "Continue Solo" to fill in the details yourself.',
    [
      { id: 'onboard_call', title: 'Call Agent'    },
      { id: 'onboard_yes',  title: 'Continue Solo' },
      { id: 'onboard_no',   title: 'Maybe Later'   },
    ],
    'PM SVANidhi Application',
    'Your data is safe and encrypted.'
  );
}

export async function handleOnboardingReply(from, buttonId) {
  if (buttonId === 'onboard_call') {
    await sendText(from,
      'Please call our agent now:\n\n' +
      AGENT_NUMBER + '\n\n' +
      'Our agent will guide you through the entire application.\n' +
      'Your progress will update here on WhatsApp as you go.\n\n' +
      'Available: Monday to Saturday, 9 AM to 6 PM'
    );
  } else if (buttonId === 'onboard_yes') {
    const { handleCollectPhone } = await import('./phase1_loanCustomization.js');
    await handleCollectPhone(from);
  } else {
    clearSession(from);
    await sendText(from,
      'No problem! We are here whenever you need us.\n\n' +
      'Just send "hi" anytime to start your PM SVANidhi application.\n\n' +
      'Thank you for your interest. Goodbye!'
    );
  }
}
