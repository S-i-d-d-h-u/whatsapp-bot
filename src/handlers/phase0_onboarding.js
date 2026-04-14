// src/handlers/phase0_onboarding.js  — Phase 0: Onboarding
import { sendText, sendButtons }           from '../services/whatsappService.js';
import { setSession, clearSession, STATE } from '../utils/sessionManager.js';

const AGENT_NUMBER = process.env.AGENT_PHONE || 'YOUR_AGENT_PHONE_NUMBER';

export async function startOnboarding(from) {
  setSession(from, STATE.ONBOARDING);

  await sendText(from,
    'Namaste! Welcome to the PM SVANidhi Support Bot.\n\n' +
    'PM SVANidhi Yojana Sahayak Bot mein aapka swagat hai.'
  );

  await sendText(from,
    'PM SVANidhi Scheme provides:\n\n' +
    '- Working capital loans up to Rs.50,000\n' +
    '- 7% interest subsidy on timely repayment\n' +
    '- Cashback on digital transactions\n' +
    '- Credit limit enhancement on good repayment\n\n' +
    'Eligible for: street vendors, hawkers, rehri-patri vendors'
  );

  await sendButtons(
    from,
    'Your application has 3 steps:\n\n' +
    'Step 1 - Eligibility and Loan Customization\n' +
    'Step 2 - Document Upload\n' +
    'Step 3 - Video KYC\n\n' +
    'The whole process takes about 10 minutes.\n\n' +
    'Tap "Call Agent" to speak with our team who will guide you through every step.\n' +
    'Or tap "Start on my own" to fill in the details yourself.',
    [
      { id: 'onboard_call', title: 'Call Agent'     },
      { id: 'onboard_yes',  title: 'Start on my own' },
      { id: 'onboard_no',   title: 'Maybe later'     },
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
      'Our agent will pick up and guide you through the entire application on this call.\n' +
      'Your progress will be updated here on WhatsApp as you go.\n\n' +
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
