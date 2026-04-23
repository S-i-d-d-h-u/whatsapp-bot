// src/handlers/phase4_videoKYC.js — Phase 4: Video KYC
// Flow: Readiness Check → How-to-KYC Image → Link Sent → Vendor joins → Agent approves
import { sendText, sendButtons, sendImage } from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }         from '../utils/sessionManager.js';
import crypto                               from 'crypto';

const KYC_BASE   = process.env.KYC_BASE_URL || 'https://meet.jit.si';
const KYC_IMG    = process.env.KYC_IMG_URL  || '';
const EXPIRY_MIN = 30;
const pause      = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// STEP 1 — Readiness check (bot asks before agent sends link)
// ══════════════════════════════════════════════════════════════════════════
export async function askKycReadiness(from) {
  setSession(from, STATE.KYC_READINESS);
  await sendButtons(
    from,
    'Almost done! One final step — Video KYC.\n\n' +
    'Before we begin, please make sure you are:\n\n' +
    '- In a quiet place with no background noise\n' +
    '- In good lighting (face clearly visible)\n' +
    '- Holding your Aadhaar Card or Voter ID\n' +
    '- On a stable internet connection\n\n' +
    'Are you ready to start the Video KYC now?',
    [
      { id: 'kyc_vendor_ready', title: 'Yes, I am ready'   },
      { id: 'kyc_vendor_later', title: 'Not yet — give me a moment' },
    ],
    'Step 3 of 3 — Video KYC',
    'The call takes 3 to 5 minutes.'
  );
}

export async function handleKycVendorReady(from) {
  // Vendor confirmed readiness — send instructional image + brief tips
  // Agent will then send the actual link from dashboard
  if (KYC_IMG) {
    await sendImage(from, KYC_IMG, 'How to complete your Video KYC').catch(() => {});
    await pause(500);
  }

  setSession(from, STATE.VIDEO_KYC);
  await sendText(from,
    'Great! Your KYC officer will send you a video call link shortly.\n\n' +
    'During the call:\n' +
    '1. Hold your ID card next to your face when asked\n' +
    '2. State your name and address clearly\n' +
    '3. Confirm your loan amount\n\n' +
    'The officer will NEVER ask for your OTP or PIN.\n\n' +
    'Please stay on this chat — your link is being prepared.'
  );
}

export async function handleKycVendorNotReady(from) {
  await sendText(from,
    'No problem! Take your time.\n\n' +
    'When you are ready:\n' +
    '- Find a quiet, well-lit spot\n' +
    '- Keep your Aadhaar Card or Voter ID handy\n\n' +
    'Reply "ready" when you want to proceed.'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 2 — Agent sends KYC link from dashboard
// ══════════════════════════════════════════════════════════════════════════
export async function startVideoKYC(from) {
  // Called by agent from dashboard after vendor confirms readiness
  setSession(from, STATE.VIDEO_KYC);

  const roomId     = 'SVANidhi' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const link       = KYC_BASE + '/' + roomId;
  const expiryTime = new Date(Date.now() + EXPIRY_MIN * 60 * 1000);

  updateSessionData(from, {
    kyc: {
      link,
      roomId,
      generatedAt: new Date().toISOString(),
      expiryTime:  expiryTime.toISOString(),
      completed:   false,
      vendorReady: true,
    },
  });

  await sendButtons(
    from,
    'Your Video KYC link is ready!\n\n' +
    link + '\n\n' +
    'Tap the link to join. Have your ID card ready to hold next to your face for the officer.\n\n' +
    'Link valid until ' + formatTime(expiryTime) + '.',
    [
      { id: 'kyc_done',  title: 'I have completed KYC' },
      { id: 'kyc_retry', title: 'Get a new link'        },
      { id: 'kyc_help',  title: 'I need help'           },
    ],
    'Join Video KYC Now',
    'Officers available: 9 AM to 6 PM'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 3 — Vendor taps done / retry / help
// ══════════════════════════════════════════════════════════════════════════
export async function handleKYCDone(from) {
  setSession(from, STATE.AWAITING_APPROVAL);
  updateSessionData(from, {
    kyc: {
      ...getSession(from).data.kyc,
      completed:   true,
      completedAt: new Date().toISOString(),
    },
  });

  await sendText(from,
    'Thank you for completing the Video KYC!\n\n' +
    'Our officer is now reviewing your details.\n' +
    'You will receive your loan approval shortly.\n\n' +
    'Please do not close this chat.'
  );
}

export async function handleKYCRetry(from) {
  await sendText(from, 'Generating a new link...');
  await pause(500);
  await startVideoKYC(from);
}

export async function handleKYCHelp(from) {
  const { data } = getSession(from);
  await sendButtons(
    from,
    'Video KYC Help\n\n' +
    'Link not opening? Open it in Chrome or Firefox.\n\n' +
    'Camera not working? Allow camera permission when the browser asks.\n\n' +
    'Call disconnected? Get a fresh link and rejoin.\n\n' +
    'Officer not available? Available 9 AM to 6 PM on working days.\n\n' +
    'Helpline: 1800-11-1979 (toll free)',
    [
      { id: 'kyc_done',  title: 'I completed the KYC' },
      { id: 'kyc_retry', title: 'Get a new link'       },
    ],
    'PM SVANidhi KYC Support'
  );
}

export async function handleKYCTextReminder(from) {
  const { data } = getSession(from);
  const link     = data.kyc?.link;
  const stateNow = getSession(from).state;

  if (stateNow === STATE.KYC_READINESS) {
    await askKycReadiness(from);
    return;
  }

  if (!link) {
    await sendText(from,
      'Your KYC link is being prepared by your agent. Please wait a moment.'
    );
    return;
  }

  await sendButtons(
    from,
    'Your Video KYC is still pending.\n\nJoin the call at:\n' + link + '\n\nTap below when done.',
    [
      { id: 'kyc_done',  title: 'I completed the KYC'  },
      { id: 'kyc_retry', title: 'Get a new link'        },
      { id: 'kyc_help',  title: 'I need help'           },
    ]
  );
}

// ══════════════════════════════════════════════════════════════════════════
// STEP 4 — Agent approves KYC from dashboard → triggers loan approval
// ══════════════════════════════════════════════════════════════════════════
export async function agentApproveKYC(from) {
  const { data }   = getSession(from);
  const loanAmount = data.loanAmount || data.eligibility?.maxLoan || 10000;
  const loanRef    = 'SVAN-' + Date.now().toString().slice(-8);
  const disburse   = getNextWorkingDay();

  updateSessionData(from, {
    kyc: { ...getSession(from).data.kyc, agentApproved: true, approvedAt: new Date().toISOString() },
    approval: {
      approved:     true,
      loanRef,
      approvedAt:   new Date().toISOString(),
      disburseDate: disburse.toISOString(),
    },
  });
  setSession(from, STATE.REPAYMENT_MENU);

  await sendText(from,
    'Your identity has been verified by our officer.\n\n' +
    'Loan APPROVED!\n\n' +
    'Loan Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '\n' +
    'Reference No: ' + loanRef + '\n' +
    'Disbursement Date: ' + formatDate(disburse) + '\n\n' +
    'Now let\'s set up your repayment plan to unlock interest subsidies and cashback.'
  );

  await pause(800);
  const { showRepaymentMenu } = await import('./phase4_repayment.js');
  await showRepaymentMenu(from);
}


// handleKYCReady — vendor taps ready on reminder; re-sends link or notifies agent pending
export async function handleKYCReady(from) {
  const { data } = getSession(from);
  if (data.kyc && data.kyc.link) {
    const expired = Date.now() > new Date(data.kyc.expiryTime || 0).getTime();
    if (expired) {
      await startVideoKYC(from);
    } else {
      await sendButtons(from,
        'Join your Video KYC call here: ' + data.kyc.link + '. Have your ID card ready.',
        [
          { id: 'kyc_done',  title: 'I have completed KYC' },
          { id: 'kyc_retry', title: 'Get a new link' },
          { id: 'kyc_help',  title: 'I need help' },
        ],
        'Join Video KYC Now'
      );
    }
  } else {
    await sendText(from, 'Your KYC officer is preparing the video call link. Please stay on this chat.');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════
function formatTime(d)  { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); }
function formatDate(d)  { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
