// handlers/messageRouter.js
// ─── Parses every incoming webhook event and dispatches to the right handler ─
import { handleTextMessage }        from './textHandler.js';
import { handleInteractiveMessage } from './interactiveHandler.js';
import { handleImageMessage }       from './imageHandler.js';

/**
 * routeMessage
 * ─────────────
 * WhatsApp sends a nested payload. This function unwraps it and
 * dispatches based on the message type.
 *
 * Webhook payload reference:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */
export async function routeMessage(req, res) {
  // Always ACK immediately (Meta retries if no 200 within 20s)
  res.sendStatus(200);

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (!message) return; // Status updates, read receipts — ignore

    const from = message.from; // Sender's phone number (E.164 format)
    const type = message.type;

    console.log(`Incoming [${type}] from ${from}`);

    switch (type) {
      case 'text':
        await handleTextMessage(from, message.text.body);
        break;

      case 'interactive':
        // Covers both list_reply and button_reply
        await handleInteractiveMessage(from, message.interactive);
        break;

      case 'image':
        await handleImageMessage(from, message.image);
        break;

      default:
        // Unsupported type (audio, video, sticker, etc.)
        await import('../services/whatsappService.js').then(({ sendText }) =>
          sendText(from, "Sorry, I can only handle text messages and images right now.")
        );
    }
  } catch (err) {
    console.error('routeMessage error:', err);
  }
}
