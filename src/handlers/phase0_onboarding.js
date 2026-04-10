// src/handlers/phase0_onboarding.js  — Phase 0: Onboarding
import { sendText, sendButtons }      from '../services/whatsappService.js';
import { setSession, clearSession, STATE } from '../utils/sessionManager.js';

export async function startOnboarding(from) {
  setSession(from, STATE.ONBOARDING);

  await sendText(from,
    `🙏 *Namaste / Julley!*\n` +
    `PM SVANidhi Yojana Sahayak Bot mein aapka swagat hai.\n\n` +
    `_Welcome to the PM SVANidhi Support Bot._`
  );

  await sendText(from,
    `📋 *PM SVANidhi Scheme*\n\n` +
    `The PM Street Vendor's AtmaNirbhar Nidhi scheme provides:\n\n` +
    `• 💰 Working capital loans up to ₹50,000\n` +
    `• 📉 7% interest subsidy on timely repayment\n` +
    `• 📱 Cashback on digital transactions\n` +
    `• 📈 Credit limit enhancement on good repayment\n\n` +
    `_Eligible for: street vendors, hawkers, rehri-patri vendors_`
  );

  await sendButtons(
    from,
    `🗺️ *Your application has 3 steps:*\n\n` +
    `*Step 1 —* Eligibility & Loan Customization\n` +
    `*Step 2 —* Document Upload\n` +
    `*Step 3 —* Video KYC\n\n` +
    `The whole process takes about 10 minutes.\nReady to begin?`,
    [
      { id: 'onboard_yes', title: "✅ Yes, let's start" },
      { id: 'onboard_no',  title: '⏳ Maybe later'      },
    ],
    'PM SVANidhi Application',
    'Your data is safe and encrypted.'
  );
}

export async function handleOnboardingReply(from, buttonId) {
  if (buttonId === 'onboard_yes') {
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
