// src/utils/speak.js — Send a message as both text and voice note
// Every message in the solo flow uses this so vendors can listen instead of read
import { sendText, sendAudio } from '../services/whatsappService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// sendSpeak: sends audio first, then text
// Order: audio → text (matches the image → audio → text convention)
export async function sendSpeak(to, text) {
  await sendAudio(to, text).catch(e => console.error('[TTS]', e.message));
  await sendText(to, text);
}

// sendSpeakButtons: sends audio first, then the interactive button message
export async function sendSpeakButtons(to, bodyText, buttons, headerText, footerText) {
  const { sendButtons } = await import('../services/whatsappService.js');
  await sendAudio(to, bodyText).catch(e => console.error('[TTS]', e.message));
  await sendButtons(to, bodyText, buttons, headerText, footerText);
}
