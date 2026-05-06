// phase0_onboarding.js — Phase 0 (v8)
// Language select → Scheme intro (image + audio + buttons)
import { sendButtons, sendImage, sendAudio, sendList } from '../services/whatsappService.js';
import { setSession, clearSession, updateSessionData, STATE } from '../utils/sessionManager.js';

const AGENT_NUMBER    = process.env.AGENT_PHONE    || '880046121';
const SCHEME_IMG_URL  = process.env.SCHEME_IMG_URL || '';
const WELCOME_IMG_URL = 'https://cdn.jsdelivr.net/gh/S-i-d-d-h-u/whatsapp-bot@main/images/namaste.png';

// ── Step 1: Language selection ─────────────────────────────────────────────
export async function startOnboarding(from) {
  setSession(from, STATE.LANGUAGE_SELECT);

  // Welcome image first
  await sendImage(from, WELCOME_IMG_URL, '').catch(() => {});

  // 2 quick-tap buttons + "More Languages" third button
  await sendButtons(
    from,
    'Please choose your preferred language to continue.',
    [
      { id: 'lang_hindi',   title: 'Hindi' },
      { id: 'lang_english', title: 'English' },
      { id: 'lang_more',    title: 'More Languages' },
    ],
    'Welcome to PM SVANidhi'
  );
}

// ── Step 1b: "More Languages" list ─────────────────────────────────────────
export async function showMoreLanguages(from) {
  await sendList(
    from,
    'Please choose your preferred language to continue.',
    'Choose Language',
    [
      {
        title: 'Regional Languages',
        rows: [
          { id: 'lang_gujarati',  title: 'Gujarati',  description: 'ગુજરાતીમાં આગળ વધો' },
          { id: 'lang_bengali',   title: 'Bengali',   description: 'বাংলায় চালিয়ে যান' },
          { id: 'lang_tamil',     title: 'Tamil',     description: 'தமிழில் தொடரவும்' },
          { id: 'lang_telugu',    title: 'Telugu',    description: 'తెలుగులో కొనసాగించండి' },
          { id: 'lang_marathi',   title: 'Marathi',   description: 'मराठीत सुरू ठेवा' },
          { id: 'lang_kannada',   title: 'Kannada',   description: 'ಕನ್ನಡದಲ್ಲಿ ಮುಂದುವರಿಯಿರಿ' },
          { id: 'lang_malayalam', title: 'Malayalam', description: 'മലയാളത്തിൽ തുടരുക' },
          { id: 'lang_punjabi',   title: 'Punjabi',   description: 'ਪੰਜਾਬੀ ਵਿੱਚ ਜਾਰੀ ਰੱਖੋ' },
        ],
      },
    ],
    'Welcome to PM SVANidhi'
  );
}

// ── Step 2: After language chosen → scheme intro ───────────────────────────
export async function handleLanguageSelect(from, langId) {
  // For the prototype all languages fall through to English
  updateSessionData(from, { language: langId });
  await showSchemeIntro(from);
}

async function showSchemeIntro(from) {
  setSession(from, STATE.ONBOARDING);

  // IMAGE first
  if (SCHEME_IMG_URL) {
    await sendImage(from, SCHEME_IMG_URL, '').catch(() => {});
  }

  // AUDIO second — mirrors the visible text only, nothing extra
  const bodyText =
    'Do you want to apply on your own, or with the help of a call agent? ' +
    'Tap Self Avail to apply on your own, or Call Agent for assisted help.';

  await sendAudio(from, bodyText).catch(e => console.error('[TTS onboarding]', e.message));

  // TEXT + BUTTONS third — no header
  await sendButtons(
    from,
    'Do you want to apply on your own, or with the help of a call agent?\n\n' +
    '• *Self Avail* — Apply independently\n' +
    '• *Call Agent* — Get assisted help\n\n' +
    'Call ' + AGENT_NUMBER + ' for agent assistance.',
    [
      { id: 'onboard_call', title: 'Call Agent' },
      { id: 'onboard_self', title: 'Self Avail' },
    ]
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
