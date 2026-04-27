// phase2_documentUpload.js — Phase 2 (v5) — minimal messages
import { sendText, sendButtons } from '../services/whatsappService.js';
import { setSession, getSession, updateSessionData, STATE } from '../utils/sessionManager.js';
import { extractTextFromImage } from '../services/ocrService.js';

const pause = ms => new Promise(r => setTimeout(r, ms));
const OVD_NAMES = { aadhaar:'Aadhaar Card', voter:'Voter ID (EPIC)', driving:'Driving Licence', ration:'Ration Card', nrega:'NREGA Job Card' };

function mergeDocs(from, key, payload) {
  const existing = getSession(from).data.docs || {};
  updateSessionData(from, { docs: { ...existing, [key]: payload } });
}

// Entry — no intro message, go straight to OVD request
export async function startDocumentUpload(from) {
  await requestOVD(from);
}

// OVD request — one line
async function requestOVD(from) {
  setSession(from, STATE.AWAIT_AADHAAR);
  await sendText(from, 'Please send a photo of your Aadhaar Card, Voter ID, Driving Licence, Ration Card, or NREGA Job Card.');
}

export async function handleAadhaarUpload(from, mediaObject) {
  await sendText(from, 'Received. Your agent is reviewing it.');
  let ocrResult = null;
  try { ocrResult = await extractTextFromImage(mediaObject.id); } catch (e) {}

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};
  const lines    = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const nameLine = lines.find(l => /^[A-Za-z\s]{4,40}$/.test(l)) || '';

  let docType = 'aadhaar';
  const ft = fullText.toLowerCase();
  if (ft.includes('voter') || ft.includes('epic'))              docType = 'voter';
  else if (ft.includes('driving') || ft.includes('licence'))    docType = 'driving';
  else if (ft.includes('ration'))                               docType = 'ration';
  else if (ft.includes('nrega') || ft.includes('job card'))     docType = 'nrega';

  mergeDocs(from, 'ovd', {
    mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
    receivedAt: new Date().toISOString(), status: 'pending_review',
    docType, docTypeLabel: OVD_NAMES[docType] || 'Identity Document',
    ocrRaw: fullText.slice(0, 400), ocrName: nameLine,
    ocrIdNumber: keyData.idNumber || '', ocrDob: keyData.dateFound || '',
    agentApproved: false,
  });
}

// QR request — no instructions on how to get it
export async function requestQRCode(from) {
  setSession(from, STATE.AWAIT_QR);
  await sendText(from, 'Please send a screenshot of your UPI QR Code.');
}

export async function handleQRUpload(from, mediaObject) {
  await sendText(from, 'Received. Your agent is reviewing it.');
  let ocrResult = null;
  try { ocrResult = await extractTextFromImage(mediaObject.id); } catch (e) {}

  const fullText = ocrResult?.fullText || '';
  const upiMatch = fullText.match(/[\w.\-]+@[a-z]+/i);

  mergeDocs(from, 'qr', {
    mediaId: mediaObject.id, mimeType: mediaObject.mime_type,
    receivedAt: new Date().toISOString(), status: 'pending_review',
    ocrRaw: fullText.slice(0, 400), ocrUpiId: upiMatch?.[0] || '',
    agentApproved: false,
  });
}

export async function handleQRSkip(from) {
  await sendText(from, 'A UPI QR code is required. Please send a screenshot of your UPI QR Code.');
}

// Agent approves — no OCR details sent to vendor
export async function agentApproveDocument(from, docKey, fields) {
  const existing = getSession(from).data.docs?.[docKey] || {};
  mergeDocs(from, docKey, { ...existing, ...fields, status: 'approved', agentApproved: true, approvedAt: new Date().toISOString() });

  const allDocs = getSession(from).data.docs || {};
  const allApproved = allDocs.ovd?.agentApproved && allDocs.qr?.agentApproved;

  if (allApproved) {
    await pause(500);
    await allDocsComplete(from);
  } else if (allDocs.ovd?.agentApproved && !allDocs.qr) {
    await requestQRCode(from);
  }
}

// Agent requests retry
export async function agentRetryDocument(from, docKey) {
  const existing = getSession(from).data.docs?.[docKey] || {};
  mergeDocs(from, docKey, { ...existing, status: 'retry' });
  const names = { ovd: 'identity document', qr: 'UPI QR Code' };
  await sendText(from, 'The photo was not clear. Please resend a clearer photo of your ' + (names[docKey] || 'document') + '.');
}

// All docs done → Phase 3
async function allDocsComplete(from) {
  const { startProfiling } = await import('./phase3_profiling.js');
  await startProfiling(from);
}

// Wrong input guard
export async function remindToUploadDocument(from, currentState) {
  const names = { [STATE.AWAIT_AADHAAR]: 'identity document', [STATE.AWAIT_QR]: 'UPI QR Code' };
  await sendText(from, 'Please send a photo of your ' + (names[currentState] || 'document') + '.');
}

// Backward-compat stubs
export async function requestPassbook(from) { await requestQRCode(from); }
export async function handlePassbookUpload(from, media) { await handleQRUpload(from, media); }
export async function handlePANUpload(from, media) { await handleAadhaarUpload(from, media); }
export async function handlePANSkip(from) { await requestQRCode(from); }
