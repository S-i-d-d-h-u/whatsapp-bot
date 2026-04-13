// src/handlers/phase0_onboarding.js  — Phase 0: Onboarding
// Updated: first message now shows a "Call Agent" button so vendor can
// initiate assisted flow. Agent then drives the session from the dashboard.
import { sendText, sendButtons }           from '../services/whatsappService.js';
import { setSession, clearSession, STATE } from '../utils/sessionManager.js';

const AGENT_NUMBER = process.env.AGENT_PHONE || 'YOUR_AGENT_PHONE_NUMBER';

export async function startOnboarding(from) {
  setSession(from, STATE.ONBOARDING);

  await sendText(from,
    `🙏 *Namaste / Julley!*\n` +
    `PM SVANidhi Yojana Sahayak Bot mein aapka swagat hai.\n\n` +
    `_Welcome to the PM SVANidhi Support Bot._\n\n` +
    `📋 *PM SVANidhi Scheme* provides:\n` +
    `• 💰 Working capital loans up to ₹50,000\n` +
    `• 📉 7% interest subsidy on timely repayment\n` +
    `• 📱 Cashback on digital transactions\n\n` +
    `_Eligible for: street vendors, hawkers, rehri-patri vendors_`
  );

  await sendButtons(
    from,
    `🗺️ *Your application has 3 steps:*\n\n` +
    `*Step 1 —* Eligibility & Loan Customization\n` +
    `*Step 2 —* Document Upload\n` +
    `*Step 3 —* Video KYC\n\n` +
    `The whole process takes about 10 minutes.\n\n` +
    `📞 *Tap "Call Agent" to speak with our team* — they will guide you through every step on this call.\n\n` +
    `Or tap "Start on my own" if you prefer to fill in the details yourself.`,
    [
      { id: 'onboard_call',  title: '📞 Call Agent'      },
      { id: 'onboard_yes',   title: '✅ Start on my own'  },
      { id: 'onboard_no',    title: '⏳ Maybe later'      },
    ],
    'PM SVANidhi Application',
    'Your data is safe and encrypted.'
  );
}

export async function handleOnboardingReply(from, buttonId) {
  if (buttonId === 'onboard_call') {
    // Send the agent's number as a tap-to-call message
    await sendText(from,
      `📞 *Please call us now:*\n\n` +
      `*${AGENT_NUMBER}*\n\n` +
      `Our agent will pick up and guide you through the entire application on this call.\n` +
      `Your progress will be updated here on WhatsApp as you go.\n\n` +
      `_Available: Monday–Saturday, 9 AM – 6 PM_`
    );
    // State stays ONBOARDING — agent will advance it from the dashboard
    // once they pick up the call and look up this vendor's number

  } else if (buttonId === 'onboard_yes') {
    const { handleCollectPhone } = await import('./phase1_loanCustomization.js');
    await handleCollectPhone(from);

  } else {
    clearSession(from);
    await sendText(from,
      `😊 No problem! We are here whenever you need us.\n\n` +
      `Just send *"hi"* anytime to start your PM SVANidhi application.\n\n` +
      `*Thank you for your interest. Goodbye!* 🛒`
    );
  }
}
