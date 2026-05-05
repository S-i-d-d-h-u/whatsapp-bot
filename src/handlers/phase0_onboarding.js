// phase0_onboarding.js — Phase 0 (v5)
// Language select → Scheme intro (image + audio + buttons)
import { sendButtons, sendImage, sendAudio, sendList } from '../services/whatsappService.js';
import { setSession, clearSession, updateSessionData, STATE } from '../utils/sessionManager.js';

const AGENT_NUMBER   = process.env.AGENT_PHONE    || '880046121';
const SCHEME_IMG_URL = process.env.SCHEME_IMG_URL || '';

// ── Step 1: Language selection ─────────────────────────────────────────────
export async function startOnboarding(from) {
  setSession(from, STATE.LANGUAGE_SELECT);

  await sendList(
    from,
    'Welcome to PM SVANidhi 🙏\n\nPlease choose your preferred language to continue.\n\nभाषा चुनें / ভাষা বেছে নিন / மொழியை தேர்ந்தெடுங்கள்',
    'Choose Language',
    [
      {
        title: 'Languages',
        rows: [
          { id: 'lang_english',   title: 'English',          description: 'Continue in English' },
          { id: 'lang_hindi',     title: 'हिन्दी',            description: 'हिन्दी में जारी रखें' },
          { id: 'lang_bengali',   title: 'বাংলা',             description: 'বাংলায় চালিয়ে যান' },
          { id: 'lang_tamil',     title: 'தமிழ்',             description: 'தமிழில் தொடரவும்' },
          { id: 'lang_telugu',    title: 'తెలుగు',            description: 'తెలుగులో కొనసాగించండి' },
          { id: 'lang_marathi',   title: 'मराठी',             description: 'मराठीत सुरू ठेवा' },
          { id: 'lang_gujarati',  title: 'ગુજરાતી',           description: 'ગુજરાતીમાં આગળ વધો' },
          { id: 'lang_kannada',   title: 'ಕನ್ನಡ',             description: 'ಕನ್ನಡದಲ್ಲಿ ಮುಂದುವರಿಯಿರಿ' },
          { id: 'lang_malayalam', title: 'മലയാളം',            description: 'മലയാളത്തിൽ തുടരുക' },
          { id: 'lang_punjabi',   title: 'ਪੰਜਾਬੀ',            description: 'ਪੰਜਾਬੀ ਵਿੱਚ ਜਾਰੀ ਰੱਖੋ' },
        ],
      },
    ],
    'PM SVANidhi'
  );
}

// ── Step 2: After language chosen → scheme intro ───────────────────────────
export async function handleLanguageSelect(from, langId) {
  // For the prototype all languages fall through to English
  // Store the selection for future use
  updateSessionData(from, { language: langId });

  await showSchemeIntro(from);
}

async function showSchemeIntro(from) {
  setSession(from, STATE.ONBOARDING);

  // IMAGE first
  if (SCHEME_IMG_URL) {
    await sendImage(from, SCHEME_IMG_URL, '').catch(() => {});
  }

  // AUDIO second
  await sendAudio(
    from,
    'PM SVANidhi is a government scheme that provides loans to street vendors. ' +
    'You can apply for a loan of up to 30,000 rupees. ' +
    'To apply on your own, tap Self Avail. ' +
    'To apply with the help of an agent, tap Call Agent.'
  ).catch(e => console.error('[TTS onboarding]', e.message));

  // TEXT + BUTTONS third
  await sendButtons(
    from,
    'Call ' + AGENT_NUMBER + ' to apply with agent assistance.',
    [
      { id: 'onboard_call', title: 'Call Agent' },
      { id: 'onboard_self', title: 'Self Avail' },
    ],
    'PM SVANidhi'
  );
}

// ── Step 3: Call Agent / Self Avail ────────────────────────────────────────
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