// handlers/interactiveHandler.js
// ─── Handles List Message replies and Reply Button taps ───────────────────
import {
  sendText,
  sendListMenu,
  sendReplyButtons,
} from '../services/whatsappService.js';
import { generateMeetingLink, formatMeetingMessage } from '../services/meetingService.js';
import { setSession, clearSession, SESSION_STATES }  from '../utils/sessionManager.js';
import { MENU } from '../../config/constants.js';

export async function handleInteractiveMessage(from, interactive) {
  // Normalise: list_reply and button_reply both expose { id, title }
  const reply = interactive.list_reply || interactive.button_reply;
  const id    = reply?.id;

  switch (id) {
    // ── List: Scan Document ────────────────────────────────────────────────
    case MENU.LIST_SCAN_DOC:
      setSession(from, SESSION_STATES.AWAITING_IMAGE);
      await sendText(from,
        `📄 *Document Scanner*\n\nPlease send me a clear photo of your document.\n\n_Supported: ID cards, invoices, forms, receipts, certificates._`
      );
      break;

    // ── List: Video Call ───────────────────────────────────────────────────
    case MENU.LIST_VIDEO_CALL:
      setSession(from, SESSION_STATES.CONFIRMING_CALL);
      await sendReplyButtons(
        from,
        `📹 *Start a Video Call?*\n\nI'll generate a private meeting link you can share with anyone.\n\nNo app download required.`,
        [
          { id: MENU.BTN_YES,  title: '✅ Yes, Generate Link' },
          { id: MENU.BTN_NO,   title: '❌ Cancel'             },
        ]
      );
      break;

    // ── List: Help ─────────────────────────────────────────────────────────
    case MENU.LIST_HELP:
      await sendText(from, [
        `❓ *How to use this bot:*`,
        ``,
        `1️⃣ Send *"menu"* to see all options`,
        `2️⃣ *Scan Document* — send a photo, I'll extract the text`,
        `3️⃣ *Video Call* — get a private meeting link instantly`,
        ``,
        `_Have issues? Contact support at support@example.com_`,
      ].join('\n'));
      break;

    // ── List: About ────────────────────────────────────────────────────────
    case MENU.LIST_ABOUT:
      await sendText(from,
        `ℹ️ *About This Bot*\n\nBuilt with WhatsApp Cloud API + Node.js.\n\n🔒 Your data is never stored.\n📦 Version 1.0.0`
      );
      break;

    // ── Button: Yes (confirm video call) ──────────────────────────────────
    case MENU.BTN_YES: {
      clearSession(from);
      const meeting = generateMeetingLink();
      await sendText(from, formatMeetingMessage(meeting));
      await sendReplyButtons(
        from,
        'Would you like to do anything else?',
        [{ id: MENU.BTN_MAIN, title: '🏠 Main Menu' }]
      );
      break;
    }

    // ── Button: No / Cancel ────────────────────────────────────────────────
    case MENU.BTN_NO:
      clearSession(from);
      await sendText(from, 'No problem! Returning to the main menu.');
      await sendListMenu(from);
      break;

    // ── Button: Main Menu ──────────────────────────────────────────────────
    case MENU.BTN_MAIN:
      clearSession(from);
      await sendListMenu(from);
      break;

    default:
      await sendText(from, "I didn't recognise that option. Type *menu* to start over.");
  }
}
