// src/handlers/phase3_videoKYC.js  — Phase 3: Video KYC
import { sendText, sendButtons, sendImage } from '../services/whatsappService.js';
import { setSession, getSession,
         updateSessionData, STATE }         from '../utils/sessionManager.js';
import crypto                               from 'crypto';

const KYC_BASE   = process.env.KYC_BASE_URL || 'https://meet.pmsvanidhi.gov.in';
const KYC_IMG    = process.env.KYC_IMG_URL  || '';
const EXPIRY_MIN = 30;
const WAIT_MS    = 4000;
const pause      = ms => new Promise(r => setTimeout(r, ms));

export async function startVideoKYC(from) {
  setSession(from, STATE.VIDEO_KYC);

  // Send KYC instructional image if URL is configured
  if (KYC_IMG) {
    await sendImage(
      from,
      KYC_IMG,
      'How to complete your Video KYC'
    ).catch(err => console.error('[KYC] Image send failed:', err.message));
    await pause(500);
  }

  await sendText(from,
    'Step 3 of 3 - Video KYC\n\n' +
    'Final Step! A KYC Officer will verify your identity over a short video call.\n\n' +
    'Before you join, please prepare:\n' +
    '- Your original Aadhaar Card or Voter ID\n' +
    '- Good lighting on your face\n' +
    '- Stable internet connection\n' +
    '- A quiet space\n\n' +
    'During the call, the officer will ask you to:\n' +
    '1. Hold your ID card next to your face\n' +
    '2. State your name and address clearly\n' +
    '3. Confirm your loan amount\n\n' +
    'The officer will NEVER ask for your OTP or PIN.'
  );

  await pause(600);

  const roomId     = 'kyc-' + crypto.randomBytes(5).toString('hex');
  const link       = KYC_BASE + '/live-kyc-' + roomId;
  const expiryTime = new Date(Date.now() + EXPIRY_MIN * 60 * 1000);

  updateSessionData(from, {
    kyc: {
      link,
      roomId,
      generatedAt: new Date().toISOString(),
      expiryTime:  expiryTime.toISOString(),
      completed:   false,
    },
  });

  await sendButtons(
    from,
    'Click the link below to join the video call:\n\n' +
    link + '\n\n' +
    'Have your ID card ready to hold next to your face for the officer.\n\n' +
    'Link valid for ' + EXPIRY_MIN + ' minutes (expires at ' + formatTime(expiryTime) + ').',
    [
      { id: 'kyc_ready', title: 'I am ready to join' },
      { id: 'kyc_help',  title: 'I need help'         },
    ],
    'Video KYC - Final Step',
    'Officers available: 9 AM to 6 PM'
  );
}

export async function handleKYCReady(from) {
  const { data } = getSession(from);
  if (isExpired(data.kyc?.expiryTime)) {
    await sendText(from, 'Your link has expired. Generating a new one...');
    await pause(600);
    await startVideoKYC(from);
    return;
  }
  await sendButtons(
    from,
    'Great! Join the call here:\n' + data.kyc.link + '\n\n' +
    'Checklist:\n' +
    '- ID card in hand\n' +
    '- Good lighting\n' +
    '- Camera and microphone allowed in browser\n\n' +
    'Once the call is finished, tap the button below.',
    [
      { id: 'kyc_done',  title: 'I have completed KYC' },
      { id: 'kyc_retry', title: 'Get a new link'        },
    ],
    'Join your Video KYC now'
  );
}

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
    'Congratulations! Process complete.\n' +
    'Your approval will take a few minutes...\n\n' +
    'Please do not close this chat.'
  );

  await pause(1800);
  await sendText(from, 'Verifying your identity documents...');
  await pause(1800);
  await sendText(from, 'Cross-checking with PM SVANidhi database...');
  await pause(WAIT_MS);

  await sendApproval(from);
}

export async function handleKYCRetry(from) {
  await sendText(from, 'Generating a new link...');
  await pause(500);
  await startVideoKYC(from);
}

export async function handleKYCHelp(from) {
  await sendButtons(
    from,
    'Video KYC Help\n\n' +
    'Link not opening? Open it in Chrome or Firefox.\n\n' +
    'Camera not working? Allow camera permission when the browser asks.\n\n' +
    'Call disconnected? Get a fresh link and rejoin.\n\n' +
    'Officer not available? Available 9 AM to 6 PM on working days.\n\n' +
    'Helpline: 1800-11-1979 (toll free)',
    [
      { id: 'kyc_ready', title: 'Try joining again' },
      { id: 'kyc_retry', title: 'Get a new link'    },
    ],
    'PM SVANidhi KYC Support'
  );
}

export async function handleKYCTextReminder(from) {
  const { data } = getSession(from);
  const link     = data.kyc?.link || 'your link above';
  await sendButtons(
    from,
    'Your Video KYC is still pending.\n\nJoin the call at:\n' + link + '\n\nTap below when done.',
    [
      { id: 'kyc_ready', title: 'I am ready to join'  },
      { id: 'kyc_done',  title: 'I have completed KYC' },
      { id: 'kyc_help',  title: 'I need help'          },
    ]
  );
}

async function sendApproval(from) {
  const { data }   = getSession(from);
  const loanAmount = data.loanAmount || 25000;
  const loanRef    = 'SVAN-' + Date.now().toString().slice(-8);
  const disburse   = getNextWorkingDay();

  updateSessionData(from, {
    approval: {
      approved:     true,
      loanRef,
      approvedAt:   new Date().toISOString(),
      disburseDate: disburse.toISOString(),
    },
  });
  setSession(from, STATE.REPAYMENT_MENU);

  await sendText(from,
    'Your loan is APPROVED!\n\n' +
    'Loan Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '\n' +
    'Reference No: ' + loanRef + '\n' +
    'Disbursement: ' + formatDate(disburse) + '\n\n' +
    'Now let\'s set up your repayment plan to unlock interest subsidies and cashback.'
  );

  await pause(800);
  const { showRepaymentMenu } = await import('./phase4_repayment.js');
  await showRepaymentMenu(from);
}

function isExpired(iso) { return !iso || Date.now() > new Date(iso).getTime(); }
function formatTime(d)  { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); }
function formatDate(d)  { return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}