// phase0_onboarding.js — Phase 0 (v4)
// Sends scheme image only + 2 buttons: Call Agent / Self Avail
import { sendButtons, sendImage } from '../services/whatsappService.js';
import { setSession, clearSession, STATE } from '../utils/sessionManager.js';

const AGENT_NUMBER   = process.env.AGENT_PHONE    || '880046121';
const SCHEME_IMG_URL = process.env.SCHEME_IMG_URL || '';

export async function startOnboarding(from) {
  setSession(from, STATE.ONBOARDING);

  if (SCHEME_IMG_URL) {
    await sendImage(from, SCHEME_IMG_URL, '').catch(() => {});
  }

  await sendButtons(
    from,
    'Call ' + AGENT_NUMBER + ' to apply with agent assistance.',
    [
      { id: 'onboard_call', title: 'Call Agent'   },
      { id: 'onboard_self', title: 'Self Avail'   },
    ],
    'PM SVANidhi'
  );
}

export async function handleOnboardingReply(from, buttonId) {
  if (buttonId === 'onboard_call') {
    await sendButtons(
      from,
      AGENT_NUMBER,
      [{ id: 'onboard_call', title: 'Call Agent' }],
      'Call us on'
    );
  } else if (buttonId === 'onboard_self' || buttonId === 'onboard_yes') {
    const { soloStart } = await import('./soloFlow.js');
    await soloStart(from);
  } else {
    clearSession(from);
  }
}
