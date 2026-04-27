// phase4_videoKYC.js — Phase 4 (v5) — minimal messages
import { sendText, sendImage } from '../services/whatsappService.js';
import { setSession, getSession, updateSessionData, STATE } from '../utils/sessionManager.js';

const KYC_IMG = process.env.KYC_IMG_URL || '';
const pause   = ms => new Promise(r => setTimeout(r, ms));

// KYC readiness — no separate check needed, go straight to instructions+video request
export async function askKycReadiness(from) {
  setSession(from, STATE.AWAIT_KYC_VIDEO);

  if (KYC_IMG) {
    await sendImage(from, KYC_IMG, '').catch(() => {});
    await pause(500);
  }

  await sendText(from,
    'Please record a short video and send it here to complete your KYC:\n\n' +
    '1. Face the camera and blink twice\n' +
    '2. Hold your identity document beside your face'
  );
}

// These stubs handle old button IDs that may come in
export async function handleKycVendorReady(from)    { await askKycReadiness(from); }
export async function handleKycVendorNotReady(from) {
  await sendText(from, 'Take your time. Send "ready" when you want to proceed.');
}

// Vendor uploads video
export async function handleKYCVideoUpload(from, mediaObject) {
  await sendText(from, 'Video received. Your agent is reviewing it.');
  updateSessionData(from, {
    kyc: {
      videoMediaId:  mediaObject.id,
      videoMimeType: mediaObject.mime_type,
      uploadedAt:    new Date().toISOString(),
      completed:     false,
      agentApproved: false,
    },
  });
  setSession(from, STATE.AWAITING_APPROVAL);
}

export async function remindToUploadVideo(from) {
  const { data } = getSession(from);
  if (data.kyc?.videoMediaId) {
    await sendText(from, 'Your video has been received. Please wait for your agent to review it.');
  } else {
    await sendText(from, 'Please record and send your verification video.');
  }
}

// handleKYCReady — vendor types "ready"
export async function handleKYCReady(from) {
  const { data } = getSession(from);
  if (data.kyc?.videoMediaId) {
    await sendText(from, 'Your video has been received. Please wait for your agent to review it.');
  } else {
    await askKycReadiness(from);
  }
}

// Stubs for backward compat
export async function startVideoKYC(from)   { await askKycReadiness(from); }
export async function handleKYCDone(from)   { await remindToUploadVideo(from); }
export async function handleKYCRetry(from)  { await askKycReadiness(from); }
export async function handleKYCHelp(from)   { await sendText(from, 'For help, call ' + (process.env.AGENT_PHONE || '880046121') + '.'); }
export async function handleKYCTextReminder(from) { await remindToUploadVideo(from); }

// Agent approves KYC — minimal message to vendor
export async function agentApproveKYC(from) {
  const { data }   = getSession(from);
  const loanAmount = data.loanAmount || data.eligibility?.maxLoan || 30000;
  const loanRef    = 'SVAN-' + Date.now().toString().slice(-8);
  const disburse   = getNextWorkingDay();

  updateSessionData(from, {
    kyc: { ...getSession(from).data.kyc, agentApproved: true, approvedAt: new Date().toISOString() },
    approval: { approved: true, loanRef, approvedAt: new Date().toISOString(), disburseDate: disburse.toISOString() },
  });
  setSession(from, STATE.REPAYMENT_MENU);

  // Minimal approval message
  await sendText(from,
    'You have been verified. Your loan of Rs.' + loanAmount.toLocaleString('en-IN') + ' has been approved.'
  );

  await pause(600);
  const { showRepaymentMenu } = await import('./phase4_repayment.js');
  await showRepaymentMenu(from);
}

function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
