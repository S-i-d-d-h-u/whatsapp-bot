// src/utils/speak.js — Send a message as both text and voice note
// Every message in the solo flow uses this so vendors can listen instead of read
import { sendText, sendAudio } from '../services/whatsappService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// sendSpeak: sends text first, then audio version after a short delay
// The audio gives vendor the option to listen to the message
export async function sendSpeak(to, text) {
  await sendText(to, text);
  await pause(300);
  // Send audio version — catches errors silently so flow never breaks
  await sendAudio(to, text).catch(e => console.error('[TTS]', e.message));
}

// sendSpeakButtons: sends interactive message (buttons can't have audio)
// so sends audio of the body text before the button message
export async function sendSpeakButtons(to, bodyText, buttons, headerText, footerText) {
  const { sendButtons } = await import('../services/whatsappService.js');
  // Send audio first so vendor hears the question before seeing buttons
  await sendAudio(to, bodyText).catch(e => console.error('[TTS]', e.message));
  await pause(300);
  await sendButtons(to, bodyText, buttons, headerText, footerText);
}
