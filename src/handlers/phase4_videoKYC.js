// src/handlers/phase4_videoKYC.js — Phase 4: Video KYC via self-recorded video
// Flow: Readiness check → Instructions image → Vendor records & uploads video
//       → Agent reviews → Agent approves → Loan disbursement
import { sendText, sendButtons, sendImage } from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }         from '../utils/sessionManager.js';

const KYC_IMG = process.env.KYC_IMG_URL || '';
const pause   = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// STEP 1 — Readiness check
// ══════════════════════════════════════════════════════════════════════════
export async function askKycReadiness(from) {
  setSession(from, STATE.KYC_READINESS);
  await sendButtons(
    from,
    'Almost done! One final step — Video Verification.\n\n' +
    'You will need to record a short 15-second video of yourself. Before you begin, make sure:\n\n' +
    '- You are in a quiet place with good lighting\n' +
    '- Your face is clearly visible\n' +
    '- Your identity document is within reach\n\n' +
    'Are you ready to record your verification video?',
    [
      { id: 'kyc_vendor_ready', title: 'Yes, I am ready' },
      { id: 'kyc_vendor_later', title: 'Not yet — give me a moment' },
    ],
    'Step 3 of 3 — Video Verification',
    'The video takes about 15 seconds to record.'
  );
}

export async function handleKycVendorReady(from) {
  setSession(from, STATE.VIDEO_KYC);

  // Send the How-to-KYC image first
  if (KYC_IMG) {
    await sendImage(from, KYC_IMG, 'How to record your verification video — follow these steps.').catch(() => {});
    await pause(800);
  }

  setSession(from, STATE.AWAIT_KYC_VIDEO);
  await sendText(from,
    'Please record a short 15-second video following these steps:\n\n' +
    '1. Hold your phone at eye level, facing you\n' +
    '2. Look directly at the camera and BLINK TWICE slowly\n' +
    '3. Hold your identity document (Aadhaar, Voter ID, etc.) beside your face\n' +
    '4. Keep both your face and the document clearly visible for 5 seconds\n\n' +
    'Then send the video here.\n\n' +
    'Make sure your face and the ID number on the document are clearly visible.'
  );
}

export async function handleKycVendorNotReady(from) {
  await sendText(from,
    'No problem! Take your time.\n\n' +
    'When you are ready:\n' +
    '- Find a quiet spot with good lighting\n' +
    '- Keep your identity document nearby\n\n' +
    'Type "ready" when you want to proceed.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 2 — Vendor uploads video
// ══════════════════════════════════════════════════════════════════════════
export async function handleKYCVideoUpload(from, mediaObject) {
  await sendText(from, 'Video received! Your agent is reviewing it now. Please wait a moment.');

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
    await sendText(from,
      'Your video has been received. Your agent is reviewing it.\n\n' +
      'Please wait — you will receive your approval shortly.'
    );
  } else {
    await sendText(from,
      'Please record and send your 15-second verification video.\n\n' +
      'Steps:\n' +
      '1. Face the camera\n' +
      '2. Blink twice slowly\n' +
      '3. Hold your identity document beside your face\n\n' +
      'Tap the attachment icon and select Video to record and send.'
    );
  }
}

// handleKYCReady — vendor types "ready" during KYC_READINESS state
export async function handleKYCReady(from) {
  const { data } = getSession(from);
  if (data.kyc?.videoMediaId) {
    await sendText(from,
      'Your video has already been received. Your agent is reviewing it.\n\n' +
      'Please wait — you will receive your approval shortly.'
    );
  } else {
    await handleKycVendorReady(from);
  }
}

// Stubs for backward compat — no longer used in new flow
export async function startVideoKYC(from) { await handleKycVendorReady(from); }
export async function handleKYCDone(from) { await remindToUploadVideo(from); }
export async function handleKYCRetry(from) { await handleKycVendorReady(from); }
export async function handleKYCHelp(from) {
  await sendText(from,
    'Video Verification Help\n\n' +
    'To record the video:\n' +
    '1. Tap the attachment icon (paperclip)\n' +
    '2. Select "Camera" or "Video"\n' +
    '3. Record for 15 seconds\n' +
    '4. Send the video\n\n' +
    'Make sure you:\n' +
    '- Blink twice slowly at the start\n' +
    '- Hold your ID card beside your face\n\n' +
    'If you need help, call your agent: ' + (process.env.AGENT_PHONE || '880046121')
  );
}
export async function handleKYCTextReminder(from) { await remindToUploadVideo(from); }

// ══════════════════════════════════════════════════════════════════════════
// STEP 3 — Agent approves video → trigger loan approval
// ══════════════════════════════════════════════════════════════════════════
export async function agentApproveKYC(from) {
  const { data }   = getSession(from);
  const loanAmount = data.loanAmount || data.eligibility?.maxLoan || 30000;
  const loanRef    = 'SVAN-' + Date.now().toString().slice(-8);
  const disburse   = getNextWorkingDay();

  updateSessionData(from, {
    kyc: {
      ...getSession(from).data.kyc,
      agentApproved: true,
      approvedAt:    new Date().toISOString(),
    },
    approval: {
      approved:     true,
      loanRef,
      approvedAt:   new Date().toISOString(),
      disburseDate: disburse.toISOString(),
    },
  });
  setSession(from, STATE.REPAYMENT_MENU);

  await sendText(from,
    'Your identity has been verified!\n\n' +
    'Loan APPROVED!\n\n' +
    'Loan Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '\n' +
    'Reference No: ' + loanRef + '\n' +
    'Disbursement Date: ' + formatDate(disburse) + '\n\n' +
    'Now let\'s set up your repayment plan.'
  );

  await pause(800);
  const { showRepaymentMenu } = await import('./phase4_repayment.js');
  await showRepaymentMenu(from);
}

function formatDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
