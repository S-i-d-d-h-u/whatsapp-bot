// handlers/imageHandler.js
// ─── Handles incoming image messages ──────────────────────────────────────
import { sendText, sendReplyButtons }                  from '../services/whatsappService.js';
import { extractTextFromImage, formatOCRResult }       from '../services/ocrService.js';
import { getSession, clearSession, SESSION_STATES }    from '../utils/sessionManager.js';
import { MENU } from '../../config/constants.js';

export async function handleImageMessage(from, image) {
  const { state } = getSession(from);

  // Only process images when user is in the OCR flow
  if (state !== SESSION_STATES.AWAITING_IMAGE) {
    await sendText(from,
      `I received your image! To scan it, please go to the menu first and choose *"Scan Document"*.`
    );
    return;
  }

  // Acknowledge immediately so the user doesn't think nothing happened
  await sendText(from, '⏳ Scanning your document... please wait a moment.');

  try {
    const result    = await extractTextFromImage(image.id);
    const formatted = formatOCRResult(result);

    clearSession(from);
    await sendText(from, formatted);

    // Offer next action
    await sendReplyButtons(
      from,
      'What would you like to do next?',
      [
        { id: 'scan_document', title: '📄 Scan Another' },
        { id: MENU.BTN_MAIN,   title: '🏠 Main Menu'   },
      ]
    );
  } catch (err) {
    console.error('OCR error:', err.message);
    clearSession(from);
    await sendText(from,
      `❌ Sorry, I couldn't read that document. Please try:\n• Better lighting\n• Holding the camera steady\n• Making sure text is fully visible`
    );
  }
}
