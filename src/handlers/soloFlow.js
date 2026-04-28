// src/handlers/soloFlow.js — Solo self-avail flow
// Vendor applies without agent assistance
// Every message sent as text + audio (TTS) so vendor can listen
import { sendText, sendButtons, sendImage, sendList } from '../services/whatsappService.js';
import { sendSpeak, sendSpeakButtons }                from '../utils/speak.js';
import { setSession, getSession, updateSessionData,
         clearSession, STATE }                        from '../utils/sessionManager.js';
import { extractTextFromImage }                       from '../services/ocrService.js';

const REPAY_IMG = process.env.REPAY_IMG_URL || '';
const KYC_IMG   = process.env.KYC_IMG_URL   || '';
const MAX_LOAN  = 30000;
const RATE      = 0.10;
const TENURE    = 12;
const pause     = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1 — Phone & OTP
// ══════════════════════════════════════════════════════════════════════════
export async function soloStart(from) {
  setSession(from, STATE.COLLECT_PHONE);
  updateSessionData(from, { soloFlow: true, dbPath: 'bank', awaitingPhoneEntry: true });
  await sendSpeak(from, 'Please enter your 10-digit bank-linked mobile number.');
}

export async function soloHandlePhone(from, text) {
  const cleaned = text.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^\d{10}$/.test(cleaned)) {
    await sendSpeak(from, 'Please enter a valid 10-digit number.');
    return;
  }
  // Generate OTP and send immediately — demo: any 4 digits accepted
  const otp = String(Math.floor(1000 + Math.random() * 9000));
  updateSessionData(from, { phone: cleaned, otpCode: otp, otpVerified: false });
  setSession(from, STATE.COLLECT_PHONE, { otpSent: true, soloFlow: true });
  await sendText(from, 'Your OTP is ' + otp + '.');
  await pause(300);
  await sendSpeak(from, 'Please enter the OTP sent to your mobile number.');
}

export async function soloHandleOtp(from, text) {
  // Demo: accept any 4-digit number
  const entered = text.trim();
  if (!/^\d{4}$/.test(entered)) {
    await sendSpeak(from, 'Please enter the 4-digit OTP sent to your mobile number.');
    return;
  }
  updateSessionData(from, { otpVerified: true });
  await soloConsentGate(from);
}

async function soloConsentGate(from) {
  setSession(from, STATE.CONSENT_GATE);
  updateSessionData(from, { soloFlow: true });
  await sendSpeakButtons(
    from,
    'We will access: your name, account number (last 4 digits), bank name and IFSC. Do you agree?',
    [
      { id: 'solo_consent_yes', title: 'Agree'    },
      { id: 'solo_consent_no',  title: 'Disagree' },
    ],
    'Data Consent'
  );
}

export async function soloHandleConsent(from, buttonId) {
  if (buttonId === 'solo_consent_no') {
    clearSession(from);
    await sendSpeak(from, 'Application cancelled. Send hi to restart.');
    return;
  }
  updateSessionData(from, { consentGiven: true });
  await soloFetchDB(from);
}

async function soloFetchDB(from) {
  setSession(from, STATE.SOLO_DB_CONFIRM);
  updateSessionData(from, { soloFlow: true });
  await pause(1500);

  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const name  = 'Ramesh Kumar';
  const bank  = 'State Bank of India';
  updateSessionData(from, {
    fetchedName: name, fetchedAccount: 'XXXX-' + last4,
    fetchedBank: bank, fetchSource: 'bank',
  });

  await sendSpeakButtons(
    from,
    'Name: ' + name + '\nAccount: XXXX-' + last4 + '\nBank: ' + bank + '\n\nIs this correct?',
    [
      { id: 'solo_db_yes', title: 'Yes' },
      { id: 'solo_db_no',  title: 'No'  },
    ],
    'Your Bank Details'
  );
}

export async function soloHandleDbConfirm(from, buttonId) {
  if (buttonId === 'solo_db_no') {
    clearSession(from);
    await sendSpeak(from, 'Please send hi to restart with your correct details.');
    return;
  }
  await soloStartDocuments(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 2 — Documents
// ══════════════════════════════════════════════════════════════════════════
async function soloStartDocuments(from) {
  setSession(from, STATE.AWAIT_AADHAAR);
  updateSessionData(from, { soloFlow: true });
  await sendSpeak(from, 'Please send a photo of your Aadhaar Card, Voter ID, Driving Licence, Ration Card, or NREGA Job Card.');
}

export async function soloHandleOVD(from, mediaObject) {
  await sendSpeak(from, 'Received. Processing your document.');
  let ocrResult = null;
  try { ocrResult = await extractTextFromImage(mediaObject.id); } catch (e) {}

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};
  // Use structured fields from Sarvam chat parser
  const nameLine = keyData.name     || 'Not detected';
  const idNum    = keyData.idNumber || 'Not detected';
  const dob      = keyData.dob      || keyData.dateFound || '';

  let docType = 'aadhaar';
  const ft = fullText.toLowerCase();
  if (ft.includes('voter') || ft.includes('epic'))           docType = 'voter';
  else if (ft.includes('driving') || ft.includes('licence')) docType = 'driving';
  else if (ft.includes('ration'))                            docType = 'ration';
  else if (ft.includes('nrega') || ft.includes('job card'))  docType = 'nrega';

  const docLabels = { aadhaar:'Aadhaar Card', voter:'Voter ID', driving:'Driving Licence', ration:'Ration Card', nrega:'NREGA Job Card' };

  updateSessionData(from, {
    soloOvdTemp: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type, docType, docTypeLabel: docLabels[docType], ocrName: nameLine, ocrIdNumber: idNum, ocrDob: dob, ocrRaw: fullText.slice(0,400) }
  });

  setSession(from, STATE.SOLO_OVD_CONFIRM);
  updateSessionData(from, { soloFlow: true });

  const msg = 'Name: ' + nameLine + '\nID: ' + idNum + (dob ? '\nDOB: ' + dob : '') + '\n\nIs this correct?';
  await sendSpeakButtons(from, msg,
    [
      { id: 'solo_ovd_yes', title: 'Yes' },
      { id: 'solo_ovd_no',  title: 'No'  },
    ],
    'Document Details'
  );
}

export async function soloHandleOVDConfirm(from, buttonId) {
  if (buttonId === 'solo_ovd_yes') {
    const { data } = getSession(from);
    const temp = data.soloOvdTemp || {};
    const existing = data.docs || {};
    updateSessionData(from, {
      docs: { ...existing, ovd: { ...temp, status: 'approved', agentApproved: true, receivedAt: new Date().toISOString() } },
      soloOvdTemp: null,
    });
    await soloRequestQR(from);
  } else {
    setSession(from, STATE.SOLO_OVD_CORRECT);
    updateSessionData(from, { soloFlow: true });
    await sendSpeak(from, 'Please enter your correct details in this format:\nName, ID Number, Date of Birth\n\nExample: Ramesh Kumar, 1234-5678-9012, 15-08-1985');
  }
}

export async function soloHandleOVDCorrection(from, text) {
  const parts = text.split(',').map(p => p.trim());
  const name  = parts[0] || '';
  const idNum = parts[1] || '';
  const dob   = parts[2] || '';
  if (!name || !idNum) {
    await sendSpeak(from, 'Please enter in this format: Name, ID Number, Date of Birth');
    return;
  }
  const { data } = getSession(from);
  const temp = data.soloOvdTemp || {};
  const existing = data.docs || {};
  updateSessionData(from, {
    docs: { ...existing, ovd: { ...temp, ocrName: name, ocrIdNumber: idNum, ocrDob: dob, status: 'approved', agentApproved: true, receivedAt: new Date().toISOString() } },
    soloOvdTemp: null,
  });
  await soloRequestQR(from);
}

async function soloRequestQR(from) {
  setSession(from, STATE.AWAIT_QR);
  updateSessionData(from, { soloFlow: true });
  await sendSpeak(from, 'Please send a screenshot of your UPI QR Code.');
}

export async function soloHandleQR(from, mediaObject) {
  await sendSpeak(from, 'Received. Processing your QR code.');
  let ocrResult = null;
  try { ocrResult = await extractTextFromImage(mediaObject.id); } catch (e) {}

  const fullText = ocrResult?.fullText || '';
  const upiMatch = fullText.match(/[\w.\-]+@[a-z]+/i);
  const upiId    = upiMatch?.[0] || 'Not detected';

  updateSessionData(from, { soloQrTemp: { mediaId: mediaObject.id, mimeType: mediaObject.mime_type, ocrUpiId: upiId, ocrRaw: fullText.slice(0,400) } });
  setSession(from, STATE.SOLO_QR_CONFIRM);
  updateSessionData(from, { soloFlow: true });

  await sendSpeakButtons(from, 'UPI ID: ' + upiId + '\n\nIs this correct?',
    [
      { id: 'solo_qr_yes', title: 'Yes' },
      { id: 'solo_qr_no',  title: 'No'  },
    ],
    'UPI Details'
  );
}

export async function soloHandleQRConfirm(from, buttonId) {
  if (buttonId === 'solo_qr_yes') {
    const { data } = getSession(from);
    const temp = data.soloQrTemp || {};
    const existing = data.docs || {};
    updateSessionData(from, {
      docs: { ...existing, qr: { ...temp, status: 'approved', agentApproved: true, receivedAt: new Date().toISOString() } },
      soloQrTemp: null,
    });
    await soloStartProfiling(from);
  } else {
    setSession(from, STATE.SOLO_QR_CORRECT);
    updateSessionData(from, { soloFlow: true });
    await sendSpeak(from, 'Please enter your correct UPI ID.\n\nExample: name@okaxis');
  }
}

export async function soloHandleQRCorrection(from, text) {
  const upiId = text.trim();
  if (!/^[\w.\-]+@[a-z]+$/i.test(upiId)) {
    await sendSpeak(from, 'Please enter a valid UPI ID.\n\nExample: name@okaxis');
    return;
  }
  const { data } = getSession(from);
  const temp = data.soloQrTemp || {};
  const existing = data.docs || {};
  updateSessionData(from, {
    docs: { ...existing, qr: { ...temp, ocrUpiId: upiId, status: 'approved', agentApproved: true, receivedAt: new Date().toISOString() } },
    soloQrTemp: null,
  });
  await soloStartProfiling(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 3 — Profiling (references + financial consent + eligibility)
// ══════════════════════════════════════════════════════════════════════════
async function soloStartProfiling(from) {
  setSession(from, STATE.PROFILING_REFS);
  updateSessionData(from, { soloFlow: true });
  await sendSpeak(from,
    'We need two contact details.\n\nFirst, provide a Reference — neighbour, fellow vendor, or local shopkeeper.\n\nEnter Name and mobile number.\nExample: Suresh Kumar, 9876543210'
  );
}

export async function soloHandleRefs(from, text) {
  const { data } = getSession(from);
  const parts = text.split(/[,\s]+/);
  const phone = parts.find(p => /^\d{10}$/.test(p.replace(/\D/g, '')));
  const name  = parts.filter(p => !/^\d/.test(p)).join(' ').trim();

  if (!name || !phone) {
    await sendSpeak(from, 'Please provide a name and 10-digit number.\nExample: Suresh Kumar, 9876543210');
    return;
  }

  if (!data.ref1Name) {
    updateSessionData(from, { ref1Name: name, ref1Phone: phone.replace(/\D/g,'') });
    await sendSpeak(from, 'Now provide your Fallback Contact — family member or close friend.\n\nExample: Meena Devi, 9988776655');
  } else {
    updateSessionData(from, { ref2Name: name, ref2Phone: phone.replace(/\D/g,'') });
    await pause(300);
    await soloFinancialConsent(from);
  }
}

async function soloFinancialConsent(from) {
  setSession(from, STATE.PROFILING_FINANCE);
  updateSessionData(from, { soloFlow: true });
  await sendSpeakButtons(
    from,
    'Do you give us permission to check your 36-month transaction history?',
    [
      { id: 'solo_finance_yes', title: 'Yes' },
      { id: 'solo_finance_no',  title: 'No'  },
    ],
    'Financial Check'
  );
}

export async function soloHandleFinancialConsent(from, buttonId) {
  const doCheck = buttonId === 'solo_finance_yes';
  updateSessionData(from, { financialCheckConsent: doCheck });
  if (doCheck) await pause(1500); else await pause(400);
  await soloShowEligibility(from, doCheck);
}

async function soloShowEligibility(from, didCheck) {
  setSession(from, STATE.LOAN_SELECTION);
  updateSessionData(from, {
    soloFlow: true,
    eligibility: { annualRevenue: didCheck ? 180000 : 150000, tranche: 1, trancheLabel: 'Tranche 1', maxLoan: MAX_LOAN, calculatedAt: new Date().toISOString() },
  });
  await sendSpeak(from,
    'You are eligible for up to Rs.' + MAX_LOAN.toLocaleString('en-IN') + '.\n\nHow much would you like to borrow? Enter an amount between Rs.5,000 and Rs.' + MAX_LOAN.toLocaleString('en-IN') + '.'
  );
}

export async function soloHandleLoanAmount(from, text) {
  const amount = parseInt(text.replace(/[^\d]/g, ''), 10);
  if (!amount || amount < 5000 || amount > MAX_LOAN) {
    await sendSpeak(from, 'Please enter an amount between Rs.5,000 and Rs.' + MAX_LOAN.toLocaleString('en-IN') + '.');
    return;
  }
  updateSessionData(from, { loanAmount: amount });
  await soloStartKYC(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 4 — KYC (auto-approved after 10 seconds)
// ══════════════════════════════════════════════════════════════════════════
async function soloStartKYC(from) {
  setSession(from, STATE.AWAIT_KYC_VIDEO);
  updateSessionData(from, { soloFlow: true });

  if (KYC_IMG) {
    await sendImage(from, KYC_IMG, '').catch(() => {});
    await pause(500);
  }

  await sendSpeak(from,
    'Please record a short video and send it here to complete your KYC.\n\n1. Face the camera and blink twice\n2. Hold your identity document beside your face'
  );
}

export async function soloHandleKYCVideo(from, mediaObject) {
  await sendSpeak(from, 'Video received. Verifying your identity.');
  updateSessionData(from, {
    kyc: { videoMediaId: mediaObject.id, videoMimeType: mediaObject.mime_type, uploadedAt: new Date().toISOString() }
  });
  setSession(from, STATE.AWAITING_APPROVAL);
  updateSessionData(from, { soloFlow: true });

  // Auto-approve after 10 seconds
  setTimeout(async () => {
    try {
      const { data } = getSession(from);
      // Check vendor is still waiting (hasn't restarted)
      if (getSession(from).state !== STATE.AWAITING_APPROVAL) return;

      const loanAmount = data.loanAmount || MAX_LOAN;
      const loanRef    = 'SVAN-' + Date.now().toString().slice(-8);
      const disburse   = getNextWorkingDay();

      updateSessionData(from, {
        kyc: { ...data.kyc, agentApproved: true, approvedAt: new Date().toISOString() },
        approval: { approved: true, loanRef, approvedAt: new Date().toISOString(), disburseDate: disburse.toISOString() },
      });
      setSession(from, STATE.REPAYMENT_MENU);
      updateSessionData(from, { soloFlow: true });

      await sendSpeak(from, 'You have been verified. Your loan of Rs.' + loanAmount.toLocaleString('en-IN') + ' has been approved.');
      await pause(800);
      await soloRepaymentMenu(from);
    } catch (e) { console.error('[Solo KYC auto-approve]', e.message); }
  }, 10000);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5 — Repayment (Fixed or Micro, tenure fixed at 12 months)
// ══════════════════════════════════════════════════════════════════════════
async function soloRepaymentMenu(from) {
  const { data } = getSession(from);
  const loan     = data.loanAmount || MAX_LOAN;
  const total    = Math.round(loan * (1 + RATE));
  const fixedEmi = Math.ceil(total / TENURE);

  if (REPAY_IMG) {
    await sendImage(from, REPAY_IMG, '').catch(() => {});
    await pause(500);
  }

  await sendList(
    from,
    'Choose your repayment plan:',
    'View Plans',
    [{
      title: 'Repayment Options',
      rows: [
        { id: 'solo_repay_fixed', title: 'Fixed EMI',        description: 'Rs.' + fixedEmi.toLocaleString('en-IN') + ' per month for 12 months' },
        { id: 'solo_repay_micro', title: 'Micro Repayment',  description: 'Variable daily deduction based on earnings' },
      ],
    }],
    'Repayment Setup'
  );
}

// Fixed EMI — show summary + confirm
export async function soloHandleRepaySelect(from, buttonId) {
  const { data } = getSession(from);
  const loan  = data.loanAmount || MAX_LOAN;
  const total = Math.round(loan * (1 + RATE));
  const emi   = Math.ceil(total / TENURE);

  if (buttonId === 'solo_repay_fixed') {
    setSession(from, STATE.SOLO_FIXED_CONFIRM);
    updateSessionData(from, { soloFlow: true, soloPlanType: 'fixed', soloPlanEmi: emi });
    await sendSpeakButtons(
      from,
      'Your monthly EMI will be Rs.' + emi.toLocaleString('en-IN') + ' for 12 months.\nTotal payable: Rs.' + total.toLocaleString('en-IN') + '.\n\nConfirm?',
      [
        { id: 'solo_plan_confirm', title: 'Confirm'      },
        { id: 'solo_plan_change',  title: 'Change plan'  },
      ],
      'Fixed EMI Plan'
    );
  } else if (buttonId === 'solo_repay_micro') {
    setSession(from, STATE.SOLO_MICRO_RATE);
    updateSessionData(from, { soloFlow: true, soloPlanType: 'micro' });
    await sendSpeak(from, 'How much can you save per Rs.200 earned? Enter an amount between Rs.10 and Rs.100.');
  }
}

// Micro — collect rate then show summary
export async function soloHandleMicroRate(from, text) {
  const { data } = getSession(from);
  const rate  = parseInt(text.replace(/[^\d]/g, ''), 10);
  if (!rate || rate < 10 || rate > 100) {
    await sendSpeak(from, 'Please enter an amount between Rs.10 and Rs.100.');
    return;
  }
  const loan     = data.loanAmount || MAX_LOAN;
  const total    = Math.round(loan * (1 + RATE));
  const monthEmi = Math.ceil(total / TENURE);

  updateSessionData(from, { soloMicroRate: rate, soloPlanEmi: monthEmi });
  setSession(from, STATE.SOLO_MICRO_CONFIRM);
  updateSessionData(from, { soloFlow: true });

  await sendSpeakButtons(
    from,
    'For every Rs.200 you earn, Rs.' + rate + ' will be auto-deducted.\nYour monthly EMI will be Rs.' + monthEmi.toLocaleString('en-IN') + ' over 12 months.\n\nConfirm?',
    [
      { id: 'solo_plan_confirm', title: 'Confirm'     },
      { id: 'solo_plan_change',  title: 'Change plan' },
    ],
    'Micro Repayment Plan'
  );
}

// Confirm or change plan
export async function soloHandlePlanConfirm(from, buttonId) {
  if (buttonId === 'solo_plan_change') {
    setSession(from, STATE.REPAYMENT_MENU);
    updateSessionData(from, { soloFlow: true });
    await soloRepaymentMenu(from);
    return;
  }
  await soloFinalize(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 6 — Final message
// ══════════════════════════════════════════════════════════════════════════
async function soloFinalize(from) {
  const { data } = getSession(from);
  setSession(from, STATE.FINALIZED);

  const loanAmount  = data.loanAmount || MAX_LOAN;
  const loanRef     = data.approval?.loanRef || 'SVAN-' + Date.now().toString().slice(-8);
  const disburse    = data.approval?.disburseDate ? new Date(data.approval.disburseDate) : getNextWorkingDay();
  const emi         = data.soloPlanEmi || Math.ceil(Math.round(loanAmount * 1.10) / TENURE);
  const firstDate   = getFirstEmiDate();
  const disburseStr = disburse.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

  await sendSpeak(from,
    'Your application is complete!\n\n' +
    'Ref: ' + loanRef + '\n' +
    'Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '\n' +
    'Disbursement: ' + disburseStr + '\n\n' +
    'First payment of Rs.' + emi.toLocaleString('en-IN') + ' is due on ' + firstDate + '.\n\n' +
    'You will receive a reminder before every payment.'
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getNextWorkingDay() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function getFirstEmiDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
}
