// src/handlers/phase0_onboarding.js  — Phase 0: Onboarding (v2)
// Sends scheme intro image + 3-button choice
import { sendText, sendButtons, sendImage } from '../services/whatsappService.js';
import { setSession, clearSession, STATE }  from '../utils/sessionManager.js';

const AGENT_NUMBER   = process.env.AGENT_PHONE    || 'YOUR_AGENT_NUMBER';
const SCHEME_IMG_URL = process.env.SCHEME_IMG_URL || '';   // host your what_is_pm_svanidhi.jpeg here

export async function startOnboarding(from) {
  setSession(from, STATE.ONBOARDING);

  // Send scheme info image if URL is configured
  if (SCHEME_IMG_URL) {
    await sendImage(from, SCHEME_IMG_URL,
      'PM SVANidhi — collateral-free working capital loans for street vendors.'
    ).catch(() => {}); // silently skip if image fails
  }

  await sendText(from,
    'Namaste! Welcome to the PM SVANidhi Support Bot.\n\n' +
    'PM SVANidhi provides:\n' +
    '- Working capital loans: Tranche 1 Rs.15,000 | Tranche 2 Rs.25,000 | Tranche 3 Rs.50,000\n' +
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
    'Tap "Call Agent" to speak with our team who will guide you through every step.\n' +
    'Or tap "Start on my own" to fill in the details yourself.',
    [
      { id: 'onboard_call', title: 'Call Agent'      },
      { id: 'onboard_yes',  title: 'Start on my own'  },
      { id: 'onboard_no',   title: 'Maybe later'       },
    ],
    'PM SVANidhi Application',
    'Your data is safe and encrypted.'
  );
}

export async function handleOnboardingReply(from, buttonId) {
  if (buttonId === 'onboard_call') {
    await sendText(from,
      'Please call us now:\n\n' +
      AGENT_NUMBER + '\n\n' +
      'Our agent will pick up and guide you through the entire application.\n' +
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
