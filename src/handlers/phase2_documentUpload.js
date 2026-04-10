// src/handlers/phase2_documentUpload.js  — Phase 2: Document Upload
import { sendText, sendButtons }                   from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }                from '../utils/sessionManager.js';
import { extractTextFromImage }                    from '../services/ocrService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// ── Entry ──────────────────────────────────────────────────────────────────
export async function startDocumentUpload(from) {
  await sendText(from,
    `✅ *Loan customization complete!*\n\n` +
    `Now let's move to *Step 2 — Document Upload*\n` +
    `───────────────────────────\n\n` +
    `You will need to upload *3 documents*:\n\n` +
    `1️⃣  Aadhaar Card or Voter ID\n` +
    `2️⃣  PAN Card _(optional — you can skip)_\n` +
    `3️⃣  Bank Passbook or Statement\n\n` +
    `📸 *Tips:* Good lighting · All 4 corners visible · Text clearly readable`
  );
  await requestAadhaar(from);
}

// ── Document 1: Aadhaar ────────────────────────────────────────────────────
async function requestAadhaar(from) {
  setSession(from, STATE.AWAIT_AADHAAR);
  await sendText(from,
    `📄 *Document 1 of 3 — Identity Proof*\n\n` +
    `Please send a *clear photo* of your:\n` +
    `• *Aadhaar Card* (front side), OR\n` +
    `• *Voter ID Card* (front side)\n\n` +
    `_Make sure your name, photo and ID number are visible._`
  );
}

export async function handleAadhaarUpload(from, mediaObject) {
  await sendText(from, `⏳ Receiving your document...`);
  try {
    const { fullText, keyData } = await extractTextFromImage(mediaObject.id);
    const preview = fullText.slice(0, 100).replace(/\n/g, ' ');
    updateSessionData(from, {
      docs: { ...getSession(from).data.docs,
              aadhaar: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
                         receivedAt: new Date().toISOString(), ocrPreview: preview } },
    });
    await sendText(from, `✅ *Identity document received!*\n\n📋 Detected: "${preview}"`);
  } catch {
    updateSessionData(from, {
      docs: { ...getSession(from).data.docs,
              aadhaar: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
                         receivedAt: new Date().toISOString() } },
    });
    await sendText(from, `✅ *Document received!* _(Text could not be auto-read — saved for manual review.)_`);
  }
  await pause(700);
  await requestPAN(from);
}

// ── Document 2: PAN (optional) ─────────────────────────────────────────────
async function requestPAN(from) {
  setSession(from, STATE.AWAIT_PAN);
  await sendButtons(
    from,
    `📄 *Document 2 of 3 — PAN Card* _(Optional)_\n\n` +
    `Please send a *clear photo of your PAN Card*.\n\n` +
    `Don't have one? Tap the button below to skip.`,
    [{ id: 'pan_skip', title: "⏭️ Skip — I don't have PAN" }],
    'PAN Card Upload',
    'PAN is optional for first-time applicants.'
  );
}

export async function handlePANUpload(from, mediaObject) {
  await sendText(from, `⏳ Receiving your PAN card...`);
  try {
    const { keyData } = await extractTextFromImage(mediaObject.id);
    updateSessionData(from, {
      docs: { ...getSession(from).data.docs,
              pan: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
                     receivedAt: new Date().toISOString(), panNumber: keyData.panNumber } },
    });
    const msg = keyData.panNumber
      ? `✅ *PAN Card received!*\n🔍 PAN Number detected: \`${keyData.panNumber}\``
      : `✅ *PAN Card received!* _(Number will be verified manually.)_`;
    await sendText(from, msg);
  } catch {
    updateSessionData(from, {
      docs: { ...getSession(from).data.docs,
              pan: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
                     receivedAt: new Date().toISOString() } },
    });
    await sendText(from, `✅ *PAN Card received!*`);
  }
  await pause(700);
  await requestPassbook(from);
}

export async function handlePANSkip(from) {
  updateSessionData(from, { docs: { ...getSession(from).data.docs, pan: 'SKIPPED' } });
  await sendText(from, `⏭️ *PAN Card skipped.* No problem — you can add it later.`);
  await pause(600);
  await requestPassbook(from);
}

// ── Document 3: Bank Passbook ──────────────────────────────────────────────
async function requestPassbook(from) {
  setSession(from, STATE.AWAIT_PASSBOOK);
  await sendText(from,
    `📄 *Document 3 of 3 — Bank Proof*\n\n` +
    `Please send a *clear photo* of:\n` +
    `• *Bank Passbook* (first page), OR\n` +
    `• *Bank Statement* (last 3 months)\n\n` +
    `Make sure account holder name, account number, and bank name are visible.`
  );
}

export async function handlePassbookUpload(from, mediaObject) {
  await sendText(from, `⏳ Receiving your bank document...`);
  try {
    const { keyData } = await extractTextFromImage(mediaObject.id);
    updateSessionData(from, {
      docs: { ...getSession(from).data.docs,
              passbook: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
                          receivedAt: new Date().toISOString(), accountNumber: keyData.accountNum } },
    });
    const msg = keyData.accountNum
      ? `✅ *Bank document received!*\n🔍 Account number: \`${keyData.accountNum}\``
      : `✅ *Bank document received!* _(Details will be verified manually.)_`;
    await sendText(from, msg);
  } catch {
    updateSessionData(from, {
      docs: { ...getSession(from).data.docs,
              passbook: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
                          receivedAt: new Date().toISOString() } },
    });
    await sendText(from, `✅ *Bank document received!*`);
  }
  await pause(700);
  await allDocsComplete(from);
}

async function allDocsComplete(from) {
  const { data } = getSession(from);
  const docs     = data.docs || {};
  const panStatus = docs.pan === 'SKIPPED' ? '⏭️ Skipped' : '✅ Uploaded';
  await sendText(from,
    `🎉 *All documents received!*\n\n` +
    `• Identity (Aadhaar/Voter ID): ✅\n` +
    `• PAN Card:                    ${panStatus}\n` +
    `• Bank Passbook/Statement:     ✅\n\n` +
    `Moving to the *final step — Video KYC.*`
  );
  await pause(900);
  const { startVideoKYC } = await import('./phase3_videoKYC.js');
  await startVideoKYC(from);
}

// ── Wrong-input guard (called when user sends TEXT in any AWAIT_* state) ───
export async function remindToUploadDocument(from, currentState) {
  const names = {
    [STATE.AWAIT_AADHAAR]:  'Aadhaar Card or Voter ID',
    [STATE.AWAIT_PAN]:      'PAN Card',
    [STATE.AWAIT_PASSBOOK]: 'Bank Passbook or Statement',
  };
  await sendText(from,
    `📸 Please upload a *photo* of your *${names[currentState] || 'document'}*.\n\n` +
    `To send a photo:\n` +
    `1. Tap the 📎 attachment icon\n` +
    `2. Select *Camera* or *Gallery*\n` +
    `3. Take or choose a clear photo\n` +
    `4. Tap Send\n\n` +
    `_You can also send a PDF file._`
  );
}
