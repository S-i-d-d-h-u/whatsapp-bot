// src/handlers/phase2_documentUpload.js — Phase 2: Document Upload & OCR (v4)
// Sequence: 1. OVD (any of 5 accepted types) → 2. UPI QR Code
// Bank passbook removed — bank details already fetched in Phase 1 via DB
import { sendText, sendButtons }        from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }     from '../utils/sessionManager.js';
import { extractTextFromImage }         from '../services/ocrService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));

const OVD_NAMES = {
  aadhaar:    'Aadhaar Card',
  voter:      'Voter ID (EPIC)',
  driving:    'Driving Licence',
  ration:     'Ration Card',
  nrega:      'NREGA Job Card',
};

function mergeDocs(from, key, payload) {
  const existing = getSession(from).data.docs || {};
  updateSessionData(from, { docs: { ...existing, [key]: payload } });
}

// ══════════════════════════════════════════════════════════════════════════
// ENTRY
// ══════════════════════════════════════════════════════════════════════════
export async function startDocumentUpload(from) {
  await sendText(from,
    'Identity verified! Moving to Step 2 - Document Upload.\n\n' +
    'You will need to send photos of 2 documents:\n\n' +
    '1. Any ONE of these identity documents (OVD):\n' +
    '   - Aadhaar Card\n' +
    '   - Voter ID Card (EPIC)\n' +
    '   - Driving Licence\n' +
    '   - Ration Card\n' +
    '   - NREGA Job Card\n\n' +
    '2. UPI QR Code\n\n' +
    'Tips: Good lighting, all 4 corners visible, text clearly readable.'
  );
  await pause(600);
  await requestOVD(from);
}

// ══════════════════════════════════════════════════════════════════════════
// DOCUMENT 1 — OVD (any of the 5 accepted types)
// ══════════════════════════════════════════════════════════════════════════
async function requestOVD(from) {
  setSession(from, STATE.AWAIT_AADHAAR);
  await sendText(from,
    'Document 1 of 2 - Identity Proof (OVD)\n\n' +
    'Please send a clear photo of ANY ONE of these documents:\n\n' +
    '1. Aadhaar Card (front side)\n' +
    '2. Voter ID Card / EPIC (front side)\n' +
    '3. Driving Licence (front side)\n' +
    '4. Ration Card\n' +
    '5. NREGA Job Card\n\n' +
    'Make sure your name and ID number are clearly visible.'
  );
}

export async function handleAadhaarUpload(from, mediaObject) {
  await sendText(from, 'Received! Reading your document, please wait...');
  let ocrResult = null;
  try {
    ocrResult = await extractTextFromImage(mediaObject.id);
  } catch (err) {
    console.error('[Phase2] OVD OCR error:', err.message);
  }

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};
  const lines    = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const nameLine = lines.find(l => /^[A-Za-z\s]{4,40}$/.test(l)) || '';

  // Detect document type from OCR text
  let docType = 'aadhaar';
  const ft = fullText.toLowerCase();
  if (ft.includes('voter') || ft.includes('epic') || ft.includes('election'))  docType = 'voter';
  else if (ft.includes('driving') || ft.includes('licence') || ft.includes('license')) docType = 'driving';
  else if (ft.includes('ration'))                                                docType = 'ration';
  else if (ft.includes('nrega') || ft.includes('job card') || ft.includes('mahatma')) docType = 'nrega';

  mergeDocs(from, 'ovd', {
    mediaId:       mediaObject.id,
    mimeType:      mediaObject.mime_type,
    receivedAt:    new Date().toISOString(),
    status:        'pending_review',
    docType,
    docTypeLabel:  OVD_NAMES[docType] || 'Identity Document',
    ocrRaw:        fullText.slice(0, 400),
    ocrName:       nameLine,
    ocrIdNumber:   keyData.idNumber  || '',
    ocrDob:        keyData.dateFound || '',
    agentApproved: false,
  });

  await sendText(from,
    'Identity document received!\n\n' +
    'Your agent is reviewing the details. You will receive a confirmation shortly.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DOCUMENT 2 — UPI QR Code
// ══════════════════════════════════════════════════════════════════════════
export async function requestQRCode(from) {
  setSession(from, STATE.AWAIT_QR);
  await sendText(from,
    'Document 2 of 2 - UPI QR Code\n\n' +
    'A UPI QR code is required to receive your loan and earn cashback.\n\n' +
    'How to get your QR code:\n' +
    '1. Open any UPI app (PhonePe, GPay, Paytm, BHIM)\n' +
    '2. Go to your profile or tap "Receive Money"\n' +
    '3. Take a screenshot of your QR code\n' +
    '4. Send the screenshot here\n\n' +
    'If you do not have a UPI app, install BHIM — it is free and takes 2 minutes.'
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
  const upiMatch = fullText.match(/[\w.\-]+@[a-z]+/i);
  const upiId    = upiMatch?.[0] || '';

  mergeDocs(from, 'qr', {
    mediaId:       mediaObject.id,
    mimeType:      mediaObject.mime_type,
    receivedAt:    new Date().toISOString(),
    status:        'pending_review',
    ocrRaw:        fullText.slice(0, 400),
    ocrUpiId:      upiId,
    agentApproved: false,
  });

  await sendText(from,
    'UPI QR code received!\n\n' +
    'Your agent is reviewing the details. You will receive a confirmation shortly.'
  );
}

export async function handleQRSkip(from) {
  await sendText(from,
    'A UPI QR code is required to complete your PM SVANidhi application.\n\n' +
    'Please send a screenshot of your UPI QR code from PhonePe, GPay, Paytm, or BHIM.'
  );
  await requestQRCode(from);
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT APPROVES A DOCUMENT
// ══════════════════════════════════════════════════════════════════════════
export async function agentApproveDocument(from, docKey, fields) {
  const existing = getSession(from).data.docs?.[docKey] || {};
  mergeDocs(from, docKey, {
    ...existing, ...fields,
    status: 'approved', agentApproved: true,
    approvedAt: new Date().toISOString(),
  });

  let msg = '';
  if (docKey === 'ovd') {
    const idDisplay = fields.ocrIdNumber
      ? fields.ocrIdNumber.slice(0, -4).replace(/\d/g, 'X') + fields.ocrIdNumber.slice(-4)
      : 'XXXX-XXXX-XXXX';
    const typeLabel = fields.docTypeLabel || OVD_NAMES[fields.docType] || 'Identity Document';
    msg =
      'Your ' + typeLabel + ' has been verified.\n\n' +
      'Details confirmed:\n' +
      'Name: ' + (fields.ocrName || 'As per document') + '\n' +
      'ID Number: ' + idDisplay + '\n' +
      (fields.ocrDob ? 'Date of Birth: ' + fields.ocrDob + '\n' : '') +
      '\nIf any detail is incorrect, please inform your agent.';
  } else if (docKey === 'qr') {
    msg =
      'Your UPI details have been verified.\n\n' +
      'UPI ID: ' + (fields.ocrUpiId || 'As registered') + '\n\n' +
      'Your repayments and cashback will be linked to this UPI ID.';
  }

  if (msg) await sendText(from, msg);

  const allDocs = getSession(from).data.docs || {};
  const allApproved = allDocs.ovd?.agentApproved && allDocs.qr?.agentApproved;

  if (allApproved) {
    await pause(700);
    await allDocsComplete(from);
  } else if (!allDocs.qr) {
    await requestQRCode(from);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AGENT REQUESTS RETRY
// ══════════════════════════════════════════════════════════════════════════
export async function agentRetryDocument(from, docKey) {
  const existing = getSession(from).data.docs?.[docKey] || {};
  mergeDocs(from, docKey, { ...existing, status: 'retry' });

  const docNames = { ovd: 'identity document', qr: 'UPI QR Code' };
  await sendText(from,
    'The photo of your ' + (docNames[docKey] || 'document') + ' was not clear enough to read.\n\n' +
    'Please resend a clearer photo:\n' +
    '- Good lighting, no shadows\n' +
    '- All 4 corners visible\n' +
    '- Hold the camera steady'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ALL DOCS COMPLETE → Phase 3
// ══════════════════════════════════════════════════════════════════════════
async function allDocsComplete(from) {
  await sendText(from,
    'All documents verified!\n\n' +
    'Identity Proof: Verified\n' +
    'UPI QR Code: Verified\n\n' +
    'Moving to Step 3 - Profiling.'
  );
  await pause(700);
  const { startProfiling } = await import('./phase3_profiling.js');
  await startProfiling(from);
}

// ══════════════════════════════════════════════════════════════════════════
// WRONG-INPUT GUARD
// ══════════════════════════════════════════════════════════════════════════
export async function remindToUploadDocument(from, currentState) {
  const names = {
    [STATE.AWAIT_AADHAAR]:  'identity document (Aadhaar, Voter ID, Driving Licence, Ration Card, or NREGA Job Card)',
    [STATE.AWAIT_QR]:       'UPI QR Code',
  };
  await sendText(from,
    'Please send a photo of your ' + (names[currentState] || 'document') + '.\n\n' +
    'Tap the attachment icon → Camera or Gallery → Take or choose photo → Send.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT STUBS
// ══════════════════════════════════════════════════════════════════════════
export async function requestPassbook(from) { await requestQRCode(from); }
export async function handlePassbookUpload(from, media) { await handleQRUpload(from, media); }
export async function handlePANUpload(from, media) { await handleAadhaarUpload(from, media); }
export async function handlePANSkip(from) { await requestQRCode(from); }
