// src/handlers/phase2_documentUpload.js  — Phase 2: Document Upload
// FIXED: removed backtick code formatting and special chars that cause
//        WhatsApp error 131009 on test numbers.
import { sendText, sendButtons }        from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }     from '../utils/sessionManager.js';
import { extractTextFromImage }         from '../services/ocrService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// ── Entry ──────────────────────────────────────────────────────────────────
export async function startDocumentUpload(from) {
  await sendText(from,
    'Loan customization complete!\n\n' +
    'Now moving to Step 2 - Document Upload\n\n' +
    'You will need to upload 3 documents:\n\n' +
    '1. Aadhaar Card or Voter ID\n' +
    '2. PAN Card (optional - you can skip)\n' +
    '3. Bank Passbook or Statement\n\n' +
    'Tips: Good lighting, all 4 corners visible, text clearly readable.'
  );
  await requestAadhaar(from);
}

// ── Document 1: Aadhaar ────────────────────────────────────────────────────
async function requestAadhaar(from) {
  setSession(from, STATE.AWAIT_AADHAAR);
  await sendText(from,
    'Document 1 of 3 - Identity Proof\n\n' +
    'Please send a clear photo of your:\n' +
    '- Aadhaar Card (front side), OR\n' +
    '- Voter ID Card (front side)\n\n' +
    'Make sure your name, photo and ID number are clearly visible.'
  );
}

export async function handleAadhaarUpload(from, mediaObject) {
  await sendText(from, 'Receiving your document, please wait...');
  try {
    const { fullText, keyData } = await extractTextFromImage(mediaObject.id);
    const preview = fullText.slice(0, 100).replace(/\n/g, ' ');
    updateSessionData(from, {
      docs: {
        ...getSession(from).data.docs,
        aadhaar: {
          mediaId:    mediaObject.id,
          mimeType:   mediaObject.mime_type,
          receivedAt: new Date().toISOString(),
          ocrPreview: preview,
        },
      },
    });
    await sendText(from,
      'Identity document received!\n\n' +
      'Text detected: ' + preview
    );
  } catch (err) {
    console.error('[Phase2] Aadhaar OCR error:', err.message);
    updateSessionData(from, {
      docs: {
        ...getSession(from).data.docs,
        aadhaar: {
          mediaId:    mediaObject.id,
          mimeType:   mediaObject.mime_type,
          receivedAt: new Date().toISOString(),
        },
      },
    });
    await sendText(from,
      'Document received! Text could not be auto-read and has been saved for manual review.'
    );
  }
  await pause(700);
  await requestPAN(from);
}

// ── Document 2: PAN (optional) ─────────────────────────────────────────────
async function requestPAN(from) {
  setSession(from, STATE.AWAIT_PAN);
  await sendButtons(
    from,
    'Document 2 of 3 - PAN Card (Optional)\n\n' +
    'Please send a clear photo of your PAN Card.\n\n' +
    'If you do not have a PAN card, tap the button below to skip.',
    [{ id: 'pan_skip', title: 'Skip - I do not have PAN' }],
    'PAN Card Upload',
    'PAN is optional for first-time applicants.'
  );
}

export async function handlePANUpload(from, mediaObject) {
  await sendText(from, 'Receiving your PAN card...');
  try {
    const { keyData } = await extractTextFromImage(mediaObject.id);
    updateSessionData(from, {
      docs: {
        ...getSession(from).data.docs,
        pan: {
          mediaId:    mediaObject.id,
          mimeType:   mediaObject.mime_type,
          receivedAt: new Date().toISOString(),
          panNumber:  keyData.panNumber,
        },
      },
    });
    const panMsg = keyData.panNumber
      ? 'PAN Card received! PAN Number detected: ' + keyData.panNumber
      : 'PAN Card received! Number will be verified manually.';
    await sendText(from, panMsg);
  } catch (err) {
    console.error('[Phase2] PAN OCR error:', err.message);
    updateSessionData(from, {
      docs: {
        ...getSession(from).data.docs,
        pan: {
          mediaId:    mediaObject.id,
          mimeType:   mediaObject.mime_type,
          receivedAt: new Date().toISOString(),
        },
      },
    });
    await sendText(from, 'PAN Card received!');
  }
  await pause(700);
  await requestPassbook(from);
}

export async function handlePANSkip(from) {
  updateSessionData(from, {
    docs: { ...getSession(from).data.docs, pan: 'SKIPPED' },
  });
  await sendText(from, 'PAN Card skipped. No problem - you can add it later.');
  await pause(600);
  await requestPassbook(from);
}

// ── Document 3: Bank Passbook ──────────────────────────────────────────────
async function requestPassbook(from) {
  setSession(from, STATE.AWAIT_PASSBOOK);
  await sendText(from,
    'Document 3 of 3 - Bank Proof\n\n' +
    'Please send a clear photo of:\n' +
    '- Bank Passbook (first page showing account details), OR\n' +
    '- Bank Statement (last 3 months)\n\n' +
    'Make sure account holder name, account number, and bank name are visible.'
  );
}

export async function handlePassbookUpload(from, mediaObject) {
  await sendText(from, 'Receiving your bank document...');
  try {
    const { keyData } = await extractTextFromImage(mediaObject.id);
    updateSessionData(from, {
      docs: {
        ...getSession(from).data.docs,
        passbook: {
          mediaId:       mediaObject.id,
          mimeType:      mediaObject.mime_type,
          receivedAt:    new Date().toISOString(),
          accountNumber: keyData.accountNum,
        },
      },
    });
    const bankMsg = keyData.accountNum
      ? 'Bank document received! Account number detected: ' + keyData.accountNum
      : 'Bank document received! Details will be verified manually.';
    await sendText(from, bankMsg);
  } catch (err) {
    console.error('[Phase2] Passbook OCR error:', err.message);
    updateSessionData(from, {
      docs: {
        ...getSession(from).data.docs,
        passbook: {
          mediaId:    mediaObject.id,
          mimeType:   mediaObject.mime_type,
          receivedAt: new Date().toISOString(),
        },
      },
    });
    await sendText(from, 'Bank document received!');
  }
  await pause(700);
  await allDocsComplete(from);
}

// ── All documents received ─────────────────────────────────────────────────
async function allDocsComplete(from) {
  const { data } = getSession(from);
  const docs      = data.docs || {};
  const panStatus = docs.pan === 'SKIPPED' ? 'Skipped' : 'Uploaded';
  await sendText(from,
    'All documents received!\n\n' +
    'Identity (Aadhaar/Voter ID): Uploaded\n' +
    'PAN Card: ' + panStatus + '\n' +
    'Bank Passbook/Statement: Uploaded\n\n' +
    'Moving to the final step - Video KYC.'
  );
  await pause(900);
  const { startVideoKYC } = await import('./phase3_videoKYC.js');
  await startVideoKYC(from);
}

// ── Wrong-input guard ──────────────────────────────────────────────────────
export async function remindToUploadDocument(from, currentState) {
  const names = {
    [STATE.AWAIT_AADHAAR]:  'Aadhaar Card or Voter ID',
    [STATE.AWAIT_PAN]:      'PAN Card',
    [STATE.AWAIT_PASSBOOK]: 'Bank Passbook or Statement',
  };
  await sendText(from,
    'Please upload a photo of your ' + (names[currentState] || 'document') + '.\n\n' +
    'To send a photo:\n' +
    '1. Tap the attachment icon\n' +
    '2. Select Camera or Gallery\n' +
    '3. Take or choose a clear photo of the document\n' +
    '4. Tap Send\n\n' +
    'You can also send a PDF file.'
  );
}
