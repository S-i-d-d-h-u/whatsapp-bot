// src/handlers/phase2_documentUpload.js  — Phase 2: Document Upload & OCR (v3)
// Sequence: 1. Aadhaar/Voter ID → 2. Bank Passbook → 3. QR/UPI ID
// After agent reviews and approves each doc, bot sends extracted info back to vendor.
import { sendText, sendButtons }        from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }     from '../utils/sessionManager.js';
import { extractTextFromImage }         from '../services/ocrService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

// ── helpers ────────────────────────────────────────────────────────────────
function mergeDocs(from, key, payload) {
  const existing = getSession(from).data.docs || {};
  updateSessionData(from, { docs: { ...existing, [key]: payload } });
}

// ══════════════════════════════════════════════════════════════════════════
// ENTRY
// ══════════════════════════════════════════════════════════════════════════
export async function startDocumentUpload(from) {
  await sendText(from,
    'Loan customization complete!\n\n' +
    'Now moving to Step 2 - Document Upload\n\n' +
    'You will need to send photos of 3 documents:\n\n' +
    '1. Aadhaar Card or Voter ID\n' +
    '2. Bank Passbook (first page)\n' +
    '3. UPI QR Code or UPI ID screenshot\n\n' +
    'Tips for a good photo: good lighting, all 4 corners visible, text clearly readable.'
  );
  await pause(600);
  await requestAadhaar(from);
}

// ══════════════════════════════════════════════════════════════════════════
// DOCUMENT 1 — Aadhaar / Voter ID
// ══════════════════════════════════════════════════════════════════════════
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
  await sendText(from, 'Received! Reading your document, please wait...');
  let ocrResult = null;
  try {
    ocrResult = await extractTextFromImage(mediaObject.id);
  } catch (err) {
    console.error('[Phase2] Aadhaar OCR error:', err.message);
  }

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};

  // Parse name heuristically: first line of text that is all caps or title case
  const lines     = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const nameLine  = lines.find(l => /^[A-Za-z\s]{4,40}$/.test(l)) || '';
  const idNumber  = keyData.idNumber  || '';
  const dateFound = keyData.dateFound || '';

  mergeDocs(from, 'aadhaar', {
    mediaId:        mediaObject.id,
    mimeType:       mediaObject.mime_type,
    receivedAt:     new Date().toISOString(),
    status:         'pending_review',   // pending_review | approved | retry
    ocrRaw:         fullText.slice(0, 400),
    ocrName:        nameLine,
    ocrIdNumber:    idNumber,
    ocrDob:         dateFound,
    agentApproved:  false,
  });

  await sendText(from,
    'Identity document received!\n\n' +
    'Your agent is reviewing the details. You will receive a confirmation shortly.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DOCUMENT 2 — Bank Passbook
// ══════════════════════════════════════════════════════════════════════════
export async function requestPassbook(from) {
  setSession(from, STATE.AWAIT_PASSBOOK);
  await sendText(from,
    'Document 2 of 3 - Bank Proof\n\n' +
    'Please send a clear photo of:\n' +
    '- Bank Passbook (first page showing account details), OR\n' +
    '- Bank Statement (top section with account number)\n\n' +
    'Make sure account holder name, account number and bank name are clearly visible.'
  );
}

export async function handlePassbookUpload(from, mediaObject) {
  await sendText(from, 'Received! Reading your bank document, please wait...');
  let ocrResult = null;
  try {
    ocrResult = await extractTextFromImage(mediaObject.id);
  } catch (err) {
    console.error('[Phase2] Passbook OCR error:', err.message);
  }

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};

  const lines      = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const nameLine   = lines.find(l => /^[A-Za-z\s]{4,40}$/.test(l)) || '';
  const bankLine   = lines.find(l => /bank|sbi|pnb|hdfc|icici|axis|canara|union|bob|ubi/i.test(l)) || '';
  const ifscLine   = lines.find(l => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(l)) || keyData.idNumber || '';
  const accountNum = keyData.accountNum || '';

  mergeDocs(from, 'passbook', {
    mediaId:        mediaObject.id,
    mimeType:       mediaObject.mime_type,
    receivedAt:     new Date().toISOString(),
    status:         'pending_review',
    ocrRaw:         fullText.slice(0, 400),
    ocrName:        nameLine,
    ocrAccount:     accountNum,
    ocrBank:        bankLine,
    ocrIfsc:        ifscLine,
    agentApproved:  false,
  });

  await sendText(from,
    'Bank document received!\n\n' +
    'Your agent is reviewing the details. You will receive a confirmation shortly.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DOCUMENT 3 — UPI QR Code
// ══════════════════════════════════════════════════════════════════════════
export async function requestQRCode(from) {
  setSession(from, STATE.AWAIT_QR);
  await sendText(from,
    'Document 3 of 3 - UPI / QR Code\n\n' +
    'A UPI QR code is required to receive your loan disbursement and earn cashback rewards.\n\n' +
    'How to get your QR code:\n' +
    '1. Open any UPI app (PhonePe, GPay, Paytm, BHIM)\n' +
    '2. Go to your profile or tap "Receive Money"\n' +
    '3. Take a screenshot of your QR code\n' +
    '4. Send the screenshot here\n\n' +
    'If you do not have a UPI app, please install BHIM from the Play Store or App Store — it is free and takes 2 minutes to set up.'
  );
}

export async function handleQRUpload(from, mediaObject) {
  await sendText(from, 'Received! Reading your UPI QR code...');
  let ocrResult = null;
  try {
    ocrResult = await extractTextFromImage(mediaObject.id);
  } catch (err) {
    console.error('[Phase2] QR OCR error:', err.message);
  }

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};

  // Extract UPI ID — format: handle@bank
  const upiMatch = fullText.match(/[\w.\-]+@[a-z]+/i);
  const upiId    = upiMatch?.[0] || keyData.emailFound?.replace('@', '_at_') || '';
  const phonePay = fullText.match(/\+?[\d]{10}/)?.[0] || '';

  mergeDocs(from, 'qr', {
    mediaId:        mediaObject.id,
    mimeType:       mediaObject.mime_type,
    receivedAt:     new Date().toISOString(),
    status:         'pending_review',
    ocrRaw:         fullText.slice(0, 400),
    ocrUpiId:       upiId,
    ocrPhone:       phonePay,
    agentApproved:  false,
  });

  await sendText(from,
    'UPI QR code received!\n\n' +
    'Your agent is reviewing the details. You will receive a confirmation shortly.'
  );
}

export async function handleQRSkip(from) {
  // QR is now mandatory — redirect back to the request
  await sendText(from,
    'A UPI QR code is required to complete your PM SVANidhi application.\n\n' +
    'Please send a screenshot of your UPI QR code from PhonePe, GPay, Paytm, or BHIM.'
  );
  await requestQRCode(from);
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT APPROVES A DOCUMENT — sends extracted info back to vendor
// Called from agentHandler with { docKey, fields }
// ══════════════════════════════════════════════════════════════════════════
export async function agentApproveDocument(from, docKey, fields) {
  // Persist the agent-edited fields and mark approved
  const existing = getSession(from).data.docs?.[docKey] || {};
  mergeDocs(from, docKey, {
    ...existing,
    ...fields,
    status:        'approved',
    agentApproved: true,
    approvedAt:    new Date().toISOString(),
  });

  // Build the transparency message back to vendor
  let msg = '';
  if (docKey === 'aadhaar') {
    const idDisplay = fields.ocrIdNumber
      ? fields.ocrIdNumber.slice(0, -4).replace(/\d/g, 'X') + fields.ocrIdNumber.slice(-4)
      : 'XXXX-XXXX-XXXX';
    msg =
      'Your Identity Document has been verified.\n\n' +
      'Details confirmed:\n' +
      'Name: ' + (fields.ocrName || 'As per document') + '\n' +
      'ID Number: ' + idDisplay + '\n' +
      (fields.ocrDob ? 'Date of Birth: ' + fields.ocrDob + '\n' : '') +
      '\nIf any detail is incorrect, please inform your agent.';
  } else if (docKey === 'passbook') {
    const accDisplay = fields.ocrAccount
      ? 'XXXX' + fields.ocrAccount.slice(-4)
      : 'XXXXXXXX';
    msg =
      'Your Bank Document has been verified.\n\n' +
      'Details confirmed:\n' +
      'Account Holder: ' + (fields.ocrName    || 'As per document') + '\n' +
      'Account Number: ' + accDisplay + '\n' +
      (fields.ocrBank ? 'Bank: ' + fields.ocrBank + '\n' : '') +
      (fields.ocrIfsc ? 'IFSC: ' + fields.ocrIfsc + '\n' : '') +
      '\nIf any detail is incorrect, please inform your agent.';
  } else if (docKey === 'qr') {
    msg =
      'Your UPI details have been verified.\n\n' +
      'Details confirmed:\n' +
      'UPI ID: ' + (fields.ocrUpiId || 'As registered') + '\n' +
      '\nYour repayments and cashback will be linked to this UPI ID.';
  }

  if (msg) await sendText(from, msg);

  // Check if all 3 docs are now approved → move to next phase
  const allDocs = getSession(from).data.docs || {};
  const allApproved =
    allDocs.aadhaar?.agentApproved &&
    allDocs.passbook?.agentApproved &&
    allDocs.qr?.agentApproved;

  if (allApproved) {
    await pause(700);
    await allDocsComplete(from);
  } else {
    // Prompt for the next pending doc
    if (!allDocs.passbook) {
      await requestPassbook(from);
    } else if (!allDocs.qr) {
      await requestQRCode(from);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT REQUESTS RETRY
// ══════════════════════════════════════════════════════════════════════════
export async function agentRetryDocument(from, docKey) {
  const existing = getSession(from).data.docs?.[docKey] || {};
  mergeDocs(from, docKey, { ...existing, status: 'retry' });

  const docNames = {
    aadhaar:  'Aadhaar Card or Voter ID',
    passbook: 'Bank Passbook',
    qr:       'UPI QR Code',
  };
  await sendText(from,
    'The photo of your ' + (docNames[docKey] || 'document') + ' was not clear enough to read.\n\n' +
    'Please resend a clearer photo:\n' +
    '- Good lighting, no shadows\n' +
    '- All 4 corners of the document visible\n' +
    '- Hold the camera steady'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ALL DOCS COMPLETE
// ══════════════════════════════════════════════════════════════════════════
async function allDocsComplete(from) {
  await sendText(from,
    'All documents have been reviewed and verified!\n\n' +
    'Identity Proof: Verified\n' +
    'Bank Document: Verified\n' +
    'UPI Details: ' + (getSession(from).data.docs?.qr?.status === 'skipped' ? 'Skipped' : 'Verified') + '\n\n' +
    'Moving to the final step - Video KYC.'
  );
  await pause(900);
  const { startProfiling } = await import('./phase3_profiling.js');
  await startProfiling(from);
}

// ══════════════════════════════════════════════════════════════════════════
// WRONG-INPUT GUARD
// ══════════════════════════════════════════════════════════════════════════
export async function remindToUploadDocument(from, currentState) {
  const names = {
    [STATE.AWAIT_AADHAAR]:  'Aadhaar Card or Voter ID',
    [STATE.AWAIT_PASSBOOK]: 'Bank Passbook',
    [STATE.AWAIT_QR]:       'UPI QR Code',
  };
  await sendText(from,
    'Please send a photo of your ' + (names[currentState] || 'document') + '.\n\n' +
    'To send a photo:\n' +
    '1. Tap the attachment icon\n' +
    '2. Select Camera or Gallery\n' +
    '3. Take or choose a clear photo\n' +
    '4. Tap Send'
  );
}

// ── Backward-compat stubs (PAN replaced by QR in new flow) ────────────────
// messageRouter and agentHandler still import these — keep them exported
// so old sessions mid-flow don't crash.
export async function handlePANUpload(from, mediaObject) {
  // PAN is no longer collected — treat as passbook if in wrong state,
  // otherwise skip straight to QR
  await sendText(from,
    'PAN Card is no longer required for this application.\n\n' +
    'Please continue to the next step.'
  );
  await requestQRCode(from);
}

export async function handlePANSkip(from) {
  const { data } = getSession(from);
  const docs = data.docs || {};
  // If passbook already approved, move to QR; otherwise request passbook first
  if (docs.passbook?.agentApproved) {
    await requestQRCode(from);
  } else {
    await requestPassbook(from);
  }
}
