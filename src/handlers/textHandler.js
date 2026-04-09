 
import { sendText, sendListMenu } from '../services/whatsappService.js';
import { clearSession } from '../utils/sessionManager.js';

const GREETINGS = ['hi', 'hello', 'hey', 'start', 'menu', 'help'];

export async function handleTextMessage(from, text) {
  const lower = text.trim().toLowerCase();
  clearSession(from);
  if (GREETINGS.some(g => lower.includes(g))) {
    await sendText(from, `👋 Welcome! I'm your assistant bot.\nLet me show you what I can do:`);
    await sendListMenu(from);
  } else {
    await sendText(from,
      `I didn't quite understand that. Type *"menu"* or *"hi"* to see what I can help you with.`
    );
  }
}