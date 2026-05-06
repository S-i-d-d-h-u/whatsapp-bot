// src/handlers/soloFlow.js — Solo self-avail flow
import { sendText, sendButtons, sendImage, sendList, sendAudio } from '../services/whatsappService.js';
import { setSession, getSession, updateSessionData,
         clearSession, STATE }                        from '../utils/sessionManager.js';
import { extractTextFromImage } from '../services/ocrService.js';
import { extractQRCodeUPI }     from '../services/qrCodeService.js';
import { sendOTPVoice, verifyOTP } from '../services/otpService.js';

const REPAY_IMG = process.env.REPAY_IMG_URL || '';
const KYC_IMG   = process.env.KYC_IMG_URL   || '';
const MAX_LOAN  = 30000;
const RATE      = 0.10;
const TENURE    = 12;

// ─── Helpers ───────────────────────────────────────────────────────────────

// Spells a phone number digit-by-digit for TTS: '9876543210' → 'nine eight seven six five four three two one zero'
function spellDigits(numStr) {
  const words = { '0':'zero','1':'one','2':'two','3':'three','4':'four',
                  '5':'five','6':'six','7':'seven','8':'eight','9':'nine' };
  return numStr.split('').map(d => words[d] || d).join(' ');
}

function forAudio(text) {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu,   '')
    .replace(/[\u{2700}-\u{27BF}]/gu,   '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu,   '')
    .replace(/\*/g, '')
    .replace(/_/g,  '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function sendMsg(from, { image = null, speak, text }) {
  if (image)  await sendImage(from, image, '').catch(() => {});
  if (speak)  await sendAudio(from, forAudio(speak)).catch(e => console.error('[TTS]', e.message));
  if (text)   await sendText(from, text);
}

async function sendMsgButtons(from, { speak, text, buttons, header = null }) {
  if (speak) await sendAudio(from, forAudio(speak)).catch(e => console.error('[TTS]', e.message));
  await sendButtons(from, text, buttons, header);
}

async function sendMsgList(from, { image = null, speak, body, buttonLabel, sections, header = null }) {
  if (image)  await sendImage(from, image, '').catch(() => {});
  if (speak)  await sendAudio(from, forAudio(speak)).catch(e => console.error('[TTS]', e.message));
  await sendList(from, body, buttonLabel, sections, header);
}

async function sendStatus(from, text) {
  await sendText(from, text);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 0 — Intro
// ══════════════════════════════════════════════════════════════════════════
export async function soloStart(from) {
  // WhatsApp sends `from` as 91XXXXXXXXXX — strip country code to get 10 digits
  const detected = from.replace(/^\+?91/, '');
  const isValid  = /^[6-9]\d{9}$/.test(detected);

  setSession(from, STATE.SOLO_PHONE_CONFIRM);
  updateSessionData(from, { soloFlow: true, dbPath: 'bank', detectedPhone: isValid ? detected : null });

  if (isValid) {
    await sendMsgButtons(from, {
      speak: 'Is ' + spellDigits(detected) + ' your bank-linked mobile number?',
      text:  '📱 Is *' + detected + '* your bank-linked mobile number?',
      buttons: [
        { id: 'solo_phone_yes', title: 'Yes, that\'s correct' },
        { id: 'solo_phone_no',  title: 'No, use a different number' },
      ],
      header: 'Confirm Your Number',
    });
  } else {
    // Fallback: couldn't parse a valid number from the sender ID
    setSession(from, STATE.COLLECT_PHONE);
    updateSessionData(from, { soloFlow: true, dbPath: 'bank' });
    await sendMsg(from, {
      speak: 'Please enter your 10-digit bank-linked mobile number.',
      text:  '📱 Please enter your *10-digit bank-linked mobile number*.',
    });
  }
}

export async function soloHandlePhoneConfirm(from, buttonId) {
  const { data } = getSession(from);

  if (buttonId === 'solo_phone_yes') {
    // Use the pre-detected number — go straight to OTP
    await soloHandlePhone(from, data.detectedPhone);
  } else {
    // Ask vendor to type the correct number
    setSession(from, STATE.COLLECT_PHONE);
    updateSessionData(from, { soloFlow: true });
    await sendMsg(from, {
      speak: 'Please enter your 10-digit bank-linked mobile number.',
      text:  '📱 Please enter your *10-digit bank-linked mobile number*.',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1 — Phone & OTP
// ══════════════════════════════════════════════════════════════════════════
export async function soloHandlePhone(from, text) {
  const cleaned = text.replace(/\s+/g, '').replace(/^\+91/, '');
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    await sendMsg(from, {
      speak: 'Please enter a valid 10-digit mobile number.',
      text:  '❌ Please enter a valid 10-digit mobile number.',
    });
    return;
  }

  try {
    await sendStatus(from, '⏳ Calling your number with OTP...');

    // 2Factor generates the OTP and speaks it — returns the OTP value
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    await sendOTPVoice(cleaned, otp);
    updateSessionData(from, {
      phone:       cleaned,
      otpCode:     otp,
      otpExpiry:   Date.now() + 5 * 60 * 1000,
      otpAttempts: 0,
      otpVerified: false,
    });
    console.log('[OTP Voice] called', cleaned, 'otp:', otp);
    setSession(from, STATE.AWAIT_OTP, { soloFlow: true });

    await sendMsg(from, {
      speak: 'You will receive a call with your OTP. Please enter the 4-digit OTP here after the call.',
      text:
        '📞 You will receive a call on *' + cleaned + '* with your OTP.\n\n' +
        'Please enter the 4-digit OTP here after the call.\n' +
        '_Valid for 5 minutes._\n\n' +
        'Type *resend* if you did not receive the call.',
    });
  } catch (err) {
    console.error('[OTP Voice error]', err.message);
    await sendMsg(from, {
      speak: 'Sorry, we could not place the call. Please enter your number again.',
      text:  '❌ Could not place OTP call. Please type your mobile number again to retry.',
    });
    setSession(from, STATE.COLLECT_PHONE, { soloFlow: true });
  }
}

export async function soloHandleOtp(from, text) {
  const entered  = text.trim();
  const { data } = getSession(from);

  // Resend — places a new IVR call
 if (entered.toLowerCase() === 'resend') {
    try {
      await sendStatus(from, '⏳ Calling your number again...');
      const otp = String(Math.floor(1000 + Math.random() * 9000));
      await sendOTPVoice(data.phone, otp);
      updateSessionData(from, {
        otpCode:     otp,
        otpExpiry:   Date.now() + 5 * 60 * 1000,
        otpAttempts: 0,
      });
      console.log('[OTP Voice resend] called', data.phone, 'otp:', otp);
      await sendMsg(from, {
        speak: 'A new call is being placed to your number with the OTP.',
        text:  '📞 A new OTP call is being placed to *' + data.phone + '*.',
      });
    } catch (err) {
      console.error('[OTP Voice resend error]', err.message);
      await sendMsg(from, {
        speak: 'Sorry, could not place the call. Please enter your number again.',
        text:  '❌ Could not place call. Please type your mobile number again.',
      });
      setSession(from, STATE.COLLECT_PHONE, { soloFlow: true });
    }
    return;
  }
  if (!/^\d{4}$/.test(entered)) {
    await sendMsg(from, {
      speak: 'Please enter the 4-digit OTP from the call.',
      text:  '❌ Please enter the 4-digit OTP from the call.\n\nType *resend* to receive the call again.',
    });
    return;
  }

  const result = verifyOTP(data, entered);

  if (result.valid) {
    updateSessionData(from, { otpVerified: true, otpCode: null, otpExpiry: null, otpAttempts: 0 });
    await soloConsentGate(from);
    return;
  }

  if (result.reason === 'expired') {
    updateSessionData(from, { otpCode: null, otpExpiry: null });
    setSession(from, STATE.COLLECT_PHONE, { soloFlow: true });
    await sendMsg(from, {
      speak: 'Your OTP has expired. Please enter your mobile number again.',
      text:  '⏰ OTP expired. Please enter your mobile number again to get a new one.',
    });
    return;
  }

  // Wrong OTP
  const attempts = (data.otpAttempts || 0) + 1;
  updateSessionData(from, { otpAttempts: attempts });

  if (attempts >= 3) {
    updateSessionData(from, { otpCode: null, otpExpiry: null, otpAttempts: 0 });
    setSession(from, STATE.COLLECT_PHONE, { soloFlow: true });
    await sendMsg(from, {
      speak: 'Too many wrong attempts. Please enter your mobile number again.',
      text:  '❌ Too many incorrect attempts. Please enter your mobile number again.',
    });
    return;
  }

  const remaining = 3 - attempts;
  await sendMsg(from, {
    speak: 'Incorrect OTP. You have ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.',
    text:
      '❌ Incorrect OTP. *' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining.*\n\n' +
      'Type *resend* to receive the call again.',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1b — Data Consent
// ══════════════════════════════════════════════════════════════════════════
async function soloConsentGate(from) {
  setSession(from, STATE.CONSENT_GATE);
  updateSessionData(from, { soloFlow: true });
  await sendMsgButtons(from, {
    speak:
      'Data Consent. We will access your name, account number last 4 digits, bank name, and IFSC code. Do you agree?',
    text:
      '🔒 *Data Consent*\n\n' +
      'We will access:\n' +
      '• Your name\n' +
      '• Account number (last 4 digits)\n' +
      '• Bank name\n' +
      '• IFSC code\n\n' +
      'Do you agree?',
    buttons: [
      { id: 'solo_consent_yes', title: 'Agree' },
      { id: 'solo_consent_no',  title: 'Disagree' },
    ],
    header: 'Data Consent',
  });
}

export async function soloHandleConsent(from, buttonId) {
  if (buttonId === 'solo_consent_no') {
    clearSession(from);
    await sendMsg(from, {
      speak: 'Application cancelled. Send hi to restart.',
      text:  'Application cancelled. Send *hi* to restart.',
    });
    return;
  }
  updateSessionData(from, { consentGiven: true });
  await soloFetchDB(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 1c — Bank Details Fetch
// ══════════════════════════════════════════════════════════════════════════
async function soloFetchDB(from) {
  setSession(from, STATE.SOLO_DB_CONFIRM);
  updateSessionData(from, { soloFlow: true });
  await sendStatus(from, '⏳ Fetching your bank details...');

  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const name  = 'Ramesh Kumar';
  const bank  = 'State Bank of India';
  updateSessionData(from, {
    fetchedName:    name,
    fetchedAccount: 'XXXX-' + last4,
    fetchedBank:    bank,
    fetchSource:    'bank',
  });

  await sendMsgButtons(from, {
    speak:
      'Your bank details. Name: ' + name +
      '. Account: XXXX ' + last4 +
      '. Bank: ' + bank +
      '. Is this correct?',
    text:
      '🏦 *Your Bank Details*\n\n' +
      '• Name: ' + name + '\n' +
      '• Account: XXXX-' + last4 + '\n' +
      '• Bank: ' + bank + '\n\n' +
      'Is this correct?',
    buttons: [
      { id: 'solo_db_yes', title: 'Yes' },
      { id: 'solo_db_no',  title: 'No' },
    ],
    header: 'Your Bank Details',
  });
}

export async function soloHandleDbConfirm(from, buttonId) {
  if (buttonId === 'solo_db_no') {
    clearSession(from);
    await sendMsg(from, {
      speak: 'Please send hi to restart with your correct details.',
      text:  'Please send *hi* to restart with your correct details.',
    });
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
  await sendMsg(from, {
    speak:
      'Please send a photo of one of the following identity documents: ' +
      'Aadhaar Card, Voter ID, Driving Licence, Ration Card, or NREGA Job Card.',
    text:
      '🪪 *Identity Document Required*\n\n' +
      'Please send a clear photo of any one of these:\n\n' +
      '• Aadhaar Card\n' +
      '• Voter ID (EPIC)\n' +
      '• Driving Licence\n' +
      '• Ration Card\n' +
      '• NREGA Job Card',
  });
}

export async function soloHandleOVD(from, mediaObject) {
  await sendStatus(from, '⏳ Processing your document...');

  let ocrResult = null;
  try { ocrResult = await extractTextFromImage(mediaObject.id); } catch (e) {}

  const fullText = ocrResult?.fullText || '';
  const keyData  = ocrResult?.keyData  || {};
  const nameLine = keyData.name     || 'Not detected';
  const idNum    = keyData.idNumber || 'Not detected';
  const dob      = keyData.dob      || keyData.dateFound || '';

  let docType = 'aadhaar';
  const ft = fullText.toLowerCase();
  if (ft.includes('voter') || ft.includes('epic'))           docType = 'voter';
  else if (ft.includes('driving') || ft.includes('licence')) docType = 'driving';
  else if (ft.includes('ration'))                            docType = 'ration';
  else if (ft.includes('nrega') || ft.includes('job card'))  docType = 'nrega';

  const docLabels = {
    aadhaar: 'Aadhaar Card',
    voter:   'Voter ID',
    driving: 'Driving Licence',
    ration:  'Ration Card',
    nrega:   'NREGA Job Card',
  };

  updateSessionData(from, {
    soloOvdTemp: {
      mediaId:      mediaObject.id,
      mimeType:     mediaObject.mime_type,
      docType,
      docTypeLabel: docLabels[docType],
      ocrName:      nameLine,
      ocrIdNumber:  idNum,
      ocrDob:       dob,
      ocrRaw:       fullText.slice(0, 400),
    },
  });
  setSession(from, STATE.SOLO_OVD_CONFIRM);
  updateSessionData(from, { soloFlow: true });

  await sendMsgButtons(from, {
    speak:
      'Document Details. Name: ' + nameLine +
      '. ID: ' + idNum +
      (dob ? '. Date of Birth: ' + dob : '') +
      '. Is this correct?',
    text:
      '📄 *Document Details*\n\n' +
      '• Name: ' + nameLine + '\n' +
      '• ID: ' + idNum +
      (dob ? '\n• DOB: ' + dob : '') +
      '\n\nIs this correct?',
    buttons: [
      { id: 'solo_ovd_yes', title: 'Yes' },
      { id: 'solo_ovd_no',  title: 'No' },
    ],
    header: 'Document Details',
  });
}

export async function soloHandleOVDConfirm(from, buttonId) {
  if (buttonId === 'solo_ovd_yes') {
    const { data } = getSession(from);
    const temp     = data.soloOvdTemp || {};
    const existing = data.docs || {};
    updateSessionData(from, {
      docs: {
        ...existing,
        ovd: { ...temp, status: 'approved', agentApproved: true, receivedAt: new Date().toISOString() },
      },
      soloOvdTemp: null,
    });
    await soloRequestQR(from);
  } else {
    setSession(from, STATE.SOLO_OVD_CORRECT);
    updateSessionData(from, { soloFlow: true });
    await sendMsg(from, {
      speak:
        'Please enter your correct details in this format: Name, ID Number, Date of Birth. ' +
        'Example: Ramesh Kumar, 1234-5678-9012, 15-08-1985',
      text:
        '✏️ *Enter Correct Details*\n\n' +
        '_Format: Name, ID Number, Date of Birth_\n\n' +
        'Example: Ramesh Kumar, 1234-5678-9012, 15-08-1985',
    });
  }
}

export async function soloHandleOVDCorrection(from, text) {
  const parts = text.split(',').map(p => p.trim());
  const name  = parts[0] || '';
  const idNum = parts[1] || '';
  const dob   = parts[2] || '';

  if (!name || !idNum) {
    await sendMsg(from, {
      speak: 'Please enter in this format: Name, ID Number, Date of Birth.',
      text:  '❌ Please enter in this format: Name, ID Number, Date of Birth',
    });
    return;
  }

  const { data } = getSession(from);
  const temp     = data.soloOvdTemp || {};
  const existing = data.docs || {};
  updateSessionData(from, {
    docs: {
      ...existing,
      ovd: {
        ...temp,
        ocrName: name, ocrIdNumber: idNum, ocrDob: dob,
        status: 'approved', agentApproved: true, receivedAt: new Date().toISOString(),
      },
    },
    soloOvdTemp: null,
  });
  await soloRequestQR(from);
}

async function soloRequestQR(from) {
  setSession(from, STATE.AWAIT_QR);
  updateSessionData(from, { soloFlow: true });
  await sendMsg(from, {
    speak: 'Please send a screenshot of your UPI QR Code.',
    text:  '📷 Please send a screenshot of your *UPI QR Code*.',
  });
}

export async function soloHandleQR(from, mediaObject) {
  await sendStatus(from, '⏳ Processing your QR code...');

  let upiId = 'Not detected';
  try {
    const qrResult = await extractQRCodeUPI(mediaObject.id);
    if (qrResult.success) upiId = qrResult.upiId;
  } catch (e) {}

  updateSessionData(from, {
    soloQrTemp: {
      mediaId:  mediaObject.id,
      mimeType: mediaObject.mime_type,
      ocrUpiId: upiId,
    },
  });
  setSession(from, STATE.SOLO_QR_CONFIRM);
  updateSessionData(from, { soloFlow: true });

  await sendMsgButtons(from, {
    speak: 'UPI Details. Your UPI ID is ' + upiId + '. Is this correct?',
    text:
      '💳 *UPI Details*\n\n' +
      '• UPI ID: ' + upiId + '\n\n' +
      'Is this correct?',
    buttons: [
      { id: 'solo_qr_yes', title: 'Yes' },
      { id: 'solo_qr_no',  title: 'No' },
    ],
    header: 'UPI Details',
  });
}

export async function soloHandleQRConfirm(from, buttonId) {
  if (buttonId === 'solo_qr_yes') {
    const { data } = getSession(from);
    const temp     = data.soloQrTemp || {};
    const existing = data.docs || {};
    updateSessionData(from, {
      docs: {
        ...existing,
        qr: { ...temp, status: 'approved', agentApproved: true, receivedAt: new Date().toISOString() },
      },
      soloQrTemp: null,
    });
    await soloStartProfiling(from);
  } else {
    setSession(from, STATE.SOLO_QR_CORRECT);
    updateSessionData(from, { soloFlow: true });
    await sendMsg(from, {
      speak: 'Please type your correct UPI ID. Example: name at okaxis.',
      text:  '✏️ Please type your correct UPI ID.\n\n_Example: name@okaxis_',
    });
  }
}

export async function soloHandleQRCorrection(from, text) {
  const upiId = text.trim();
  if (!/^[\w.\-]+@[a-z]+$/i.test(upiId)) {
    await sendMsg(from, {
      speak: 'That is not a valid UPI ID. Example: name at okaxis.',
      text:  '❌ That is not a valid UPI ID.\n\n_Example: name@okaxis_',
    });
    return;
  }

  const { data } = getSession(from);
  const temp     = data.soloQrTemp || {};
  const existing = data.docs || {};
  updateSessionData(from, {
    docs: {
      ...existing,
      qr: {
        ...temp, ocrUpiId: upiId,
        status: 'approved', agentApproved: true, receivedAt: new Date().toISOString(),
      },
    },
    soloQrTemp: null,
  });
  await soloStartProfiling(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 3 — Profiling
// ══════════════════════════════════════════════════════════════════════════
async function soloStartProfiling(from) {
  setSession(from, STATE.PROFILING_REFS);
  updateSessionData(from, { soloFlow: true });
  await sendMsg(from, {
    speak:
      'We need two contact details. First, provide a Reference — a neighbour, fellow vendor, or local shopkeeper. ' +
      'Enter their name and mobile number. Example: Suresh Kumar, 9876543210',
    text:
      '👥 *Reference Contact*\n\n' +
      'Provide a neighbour, fellow vendor, or local shopkeeper.\n\n' +
      '_Enter name and mobile number:_\n' +
      'Example: Suresh Kumar, 9876543210',
  });
}

export async function soloHandleRefs(from, text) {
  const { data } = getSession(from);
  const parts    = text.split(/[,\s]+/);
  const phone    = parts.find(p => /^\d{10}$/.test(p.replace(/\D/g, '')));
  const name     = parts.filter(p => !/^\d/.test(p)).join(' ').trim();

  if (!name || !phone) {
    await sendMsg(from, {
      speak: 'Please provide a name and 10-digit number. Example: Suresh Kumar, 9876543210',
      text:  '❌ Please provide a name and 10-digit number.\n\nExample: Suresh Kumar, 9876543210',
    });
    return;
  }

  if (!data.ref1Name) {
    updateSessionData(from, { ref1Name: name, ref1Phone: phone.replace(/\D/g, '') });
    await sendMsg(from, {
      speak:
        'Got it. Now provide your Fallback Contact — a family member or close friend. ' +
        'Example: Meena Devi, 9988776655',
      text:
        '👨‍👩‍👧 *Fallback Contact*\n\n' +
        'Provide a family member or close friend.\n\n' +
        '_Enter name and mobile number:_\n' +
        'Example: Meena Devi, 9988776655',
    });
  } else {
    updateSessionData(from, { ref2Name: name, ref2Phone: phone.replace(/\D/g, '') });
    await soloFinancialConsent(from);
  }
}

async function soloFinancialConsent(from) {
  setSession(from, STATE.PROFILING_FINANCE);
  updateSessionData(from, { soloFlow: true });
  await sendMsgButtons(from, {
    speak:   'Financial Check. Do you give us permission to check your 36-month transaction history?',
    text:
      '📊 *Financial Check*\n\n' +
      'Do you give us permission to check your 36-month transaction history?',
    buttons: [
      { id: 'solo_finance_yes', title: 'Yes' },
      { id: 'solo_finance_no',  title: 'No' },
    ],
    header: 'Financial Check',
  });
}

export async function soloHandleFinancialConsent(from, buttonId) {
  const doCheck = buttonId === 'solo_finance_yes';
  updateSessionData(from, { financialCheckConsent: doCheck });
  if (doCheck) await sendStatus(from, '⏳ Checking your transaction history...');
  await soloShowEligibility(from, doCheck);
}

async function soloShowEligibility(from, didCheck) {
  setSession(from, STATE.LOAN_SELECTION);
  updateSessionData(from, {
    soloFlow: true,
    eligibility: {
      annualRevenue: didCheck ? 180000 : 150000,
      tranche:       1,
      trancheLabel:  'Tranche 1',
      maxLoan:       MAX_LOAN,
      calculatedAt:  new Date().toISOString(),
    },
  });
  await sendMsg(from, {
    speak:
      'Great news! You are eligible for up to Rs.' + MAX_LOAN.toLocaleString('en-IN') +
      '. How much would you like to borrow? Enter an amount between Rs.5,000 and Rs.' +
      MAX_LOAN.toLocaleString('en-IN') + '.',
    text:
      '🎉 *You are eligible!*\n\n' +
      'You can borrow up to *Rs.' + MAX_LOAN.toLocaleString('en-IN') + '*\n\n' +
      '_Enter the amount you need:_\n' +
      'Between Rs.5,000 and Rs.' + MAX_LOAN.toLocaleString('en-IN'),
  });
}

export async function soloHandleLoanAmount(from, text) {
  const amount = parseInt(text.replace(/[^\d]/g, ''), 10);
  if (!amount || amount < 5000 || amount > MAX_LOAN) {
    await sendMsg(from, {
      speak: 'Please enter an amount between Rs.5,000 and Rs.' + MAX_LOAN.toLocaleString('en-IN') + '.',
      text:  '❌ Please enter an amount between Rs.5,000 and Rs.' + MAX_LOAN.toLocaleString('en-IN'),
    });
    return;
  }
  updateSessionData(from, { loanAmount: amount });
  await soloStartKYC(from);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 4 — KYC
// ══════════════════════════════════════════════════════════════════════════
async function soloStartKYC(from) {
  setSession(from, STATE.AWAIT_KYC_VIDEO);
  updateSessionData(from, { soloFlow: true });
  await sendMsg(from, {
    image: KYC_IMG || null,
    speak:
      'Video KYC. Please record a short video and send it here. ' +
      'Step 1: Face the camera and blink twice. ' +
      'Step 2: Hold your identity document beside your face.',
    text:
      '🎥 *Video KYC*\n\n' +
      'Record a short video and send it here:\n\n' +
      '1. Face the camera and blink twice 👁️\n' +
      '2. Hold your identity document beside your face 🪪',
  });
}

export async function soloHandleKYCVideo(from, mediaObject) {
  await sendStatus(from, '⏳ Verifying your identity...');
  updateSessionData(from, {
    kyc: {
      videoMediaId:  mediaObject.id,
      videoMimeType: mediaObject.mime_type,
      uploadedAt:    new Date().toISOString(),
    },
  });
  setSession(from, STATE.AWAITING_APPROVAL);
  updateSessionData(from, { soloFlow: true });

  setTimeout(async () => {
    try {
      if (getSession(from).state !== STATE.AWAITING_APPROVAL) return;
      const { data }   = getSession(from);
      const loanAmount = data.loanAmount || MAX_LOAN;
      const loanRef    = 'SVAN-' + Date.now().toString().slice(-8);
      const disburse   = getNextWorkingDay();

      updateSessionData(from, {
        kyc: { ...data.kyc, agentApproved: true, approvedAt: new Date().toISOString() },
        approval: {
          approved:     true,
          loanRef,
          approvedAt:   new Date().toISOString(),
          disburseDate: disburse.toISOString(),
        },
      });
      setSession(from, STATE.REPAYMENT_MENU);
      updateSessionData(from, { soloFlow: true });

      await sendMsg(from, {
        speak: 'Identity verified! Your loan of Rs.' + loanAmount.toLocaleString('en-IN') + ' has been approved.',
        text:
          '✅ *Identity Verified!*\n\n' +
          'Your loan of *Rs.' + loanAmount.toLocaleString('en-IN') + '* has been approved. 🎉',
      });
      await soloRepaymentMenu(from);
    } catch (e) { console.error('[Solo KYC auto-approve]', e.message); }
  }, 10000);
}

// ══════════════════════════════════════════════════════════════════════════
// PHASE 5 — Repayment
// ══════════════════════════════════════════════════════════════════════════
async function soloRepaymentMenu(from) {
  const { data }  = getSession(from);
  const loan      = data.loanAmount || MAX_LOAN;
  const total     = Math.round(loan * (1 + RATE));
  const fixedEmi  = Math.ceil(total / TENURE);
  const firstDate = getFirstEmiDate();

  await sendMsgList(from, {
    image: REPAY_IMG || null,
    speak:
      'Choose your repayment plan. ' +
      'Option 1: Fixed EMI — Rs.' + fixedEmi.toLocaleString('en-IN') + ' per month for 12 months. ' +
      'Option 2: Micro Repayment — a small amount is deducted daily based on your earnings. ' +
      'First payment is due on ' + firstDate + '.',
    body:
      '💰 *Choose Your Repayment Plan*\n\n' +
      'First payment due: *' + firstDate + '*',
    buttonLabel: 'View Plans',
    sections: [{
      title: 'Repayment Options',
      rows: [
        {
          id:          'solo_repay_fixed',
          title:       'Fixed EMI',
          description: 'Rs.' + fixedEmi.toLocaleString('en-IN') + '/month for 12 months',
        },
        {
          id:          'solo_repay_micro',
          title:       'Micro Repayment',
          description: 'Daily deduction based on earnings',
        },
      ],
    }],
    header: 'Repayment Setup',
  });
}

export async function soloHandleRepaySelect(from, buttonId) {
  const { data }  = getSession(from);
  const loan      = data.loanAmount || MAX_LOAN;
  const total     = Math.round(loan * (1 + RATE));
  const emi       = Math.ceil(total / TENURE);
  const firstDate = getFirstEmiDate();

  if (buttonId === 'solo_repay_fixed') {
    setSession(from, STATE.SOLO_FIXED_CONFIRM);
    updateSessionData(from, { soloFlow: true, soloPlanType: 'fixed', soloPlanEmi: emi });

    await sendMsgButtons(from, {
      speak:
        'Fixed EMI Plan. ' +
        'Monthly EMI: Rs.' + emi.toLocaleString('en-IN') + '. ' +
        'Duration: 12 months. ' +
        'Total payable: Rs.' + total.toLocaleString('en-IN') + '. ' +
        'First payment on ' + firstDate + '. ' +
        'Do you confirm?',
      text:
        '📋 *Fixed EMI Plan*\n\n' +
        '• Monthly EMI: *Rs.' + emi.toLocaleString('en-IN') + '*\n' +
        '• Duration: 12 months\n' +
        '• Total payable: Rs.' + total.toLocaleString('en-IN') + '\n' +
        '• First payment: ' + firstDate + '\n\n' +
        'Do you confirm?',
      buttons: [
        { id: 'solo_plan_confirm', title: 'Confirm' },
        { id: 'solo_plan_change',  title: 'Change plan' },
      ],
      header: 'Fixed EMI Plan',
    });

  } else if (buttonId === 'solo_repay_micro') {
    setSession(from, STATE.SOLO_MICRO_RATE);
    updateSessionData(from, { soloFlow: true, soloPlanType: 'micro' });
    await sendMsg(from, {
      speak:
        'Micro Repayment Plan. ' +
        'How much can you save per Rs.200 earned? Enter an amount between Rs.10 and Rs.100.',
      text:
        '📊 *Micro Repayment Plan*\n\n' +
        'How much can you save per *Rs.200* earned?\n\n' +
        '_Enter an amount between Rs.10 and Rs.100_',
    });
  }
}

export async function soloHandleMicroRate(from, text) {
  const { data }  = getSession(from);
  const rate      = parseInt(text.replace(/[^\d]/g, ''), 10);
  if (!rate || rate < 10 || rate > 100) {
    await sendMsg(from, {
      speak: 'Please enter an amount between Rs.10 and Rs.100.',
      text:  '❌ Please enter an amount between Rs.10 and Rs.100.',
    });
    return;
  }

  const loan      = data.loanAmount || MAX_LOAN;
  const total     = Math.round(loan * (1 + RATE));
  const monthEmi  = Math.ceil(total / TENURE);
  const firstDate = getFirstEmiDate();

  updateSessionData(from, { soloMicroRate: rate, soloPlanEmi: monthEmi });
  setSession(from, STATE.SOLO_MICRO_CONFIRM);
  updateSessionData(from, { soloFlow: true });

  await sendMsgButtons(from, {
    speak:
      'Micro Repayment Plan. ' +
      'For every Rs.200 you earn, Rs.' + rate + ' will be auto-deducted. ' +
      'Auto debit runs from the 1st to the 20th of every month. ' +
      'After the 20th, deductions stop. ' +
      'Any remaining amount must be paid manually by the 30th. ' +
      'Monthly EMI: Rs.' + monthEmi.toLocaleString('en-IN') + ' over 12 months. ' +
      'First payment on ' + firstDate + '. ' +
      'Do you confirm?',
    text:
      '📊 *Micro Repayment Plan*\n\n' +
      '• Per Rs.200 earned: *Rs.' + rate + ' auto-deducted* 💸\n' +
      '• Auto debit: *1st to 20th* of every month\n' +
      '• After 20th: deductions stop 🛑\n' +
      '• Remaining balance due by: *30th of the month*\n' +
      '• Monthly EMI: *Rs.' + monthEmi.toLocaleString('en-IN') + '* over 12 months\n' +
      '• First payment: ' + firstDate + '\n\n' +
      'Do you confirm?',
    buttons: [
      { id: 'solo_plan_confirm', title: 'Confirm' },
      { id: 'solo_plan_change',  title: 'Change plan' },
    ],
    header: 'Micro Repayment Plan',
  });
}

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
// PHASE 6 — Finalization
// ══════════════════════════════════════════════════════════════════════════
async function soloFinalize(from) {
  const { data }    = getSession(from);
  setSession(from, STATE.FINALIZED);

  const loanAmount  = data.loanAmount || MAX_LOAN;
  const loanRef     = data.approval?.loanRef || 'SVAN-' + Date.now().toString().slice(-8);
  const disburse    = data.approval?.disburseDate
    ? new Date(data.approval.disburseDate)
    : getNextWorkingDay();
  const emi         = data.soloPlanEmi || Math.ceil(Math.round(loanAmount * 1.10) / TENURE);
  const firstDate   = getFirstEmiDate();
  const disburseStr = disburse.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const planType    = data.soloPlanType || 'fixed';

  await sendMsg(from, {
    speak:
      'Congratulations! Your loan has been disbursed. ' +
      'Loan reference: ' + loanRef + '. ' +
      'Amount: Rs.' + loanAmount.toLocaleString('en-IN') + '. ' +
      'Disbursement date: ' + disburseStr + '. ' +
      'Your first payment of Rs.' + emi.toLocaleString('en-IN') + ' is due on ' + firstDate + '. ' +
      (planType === 'micro'
        ? 'Auto debit runs from the 1st to the 20th of every month. Any remaining amount must be paid by the 30th. '
        : '') +
      'You will receive a reminder before every payment.',
    text:
      '🎊 *Loan Disbursed!*\n\n' +
      '• Ref: ' + loanRef + '\n' +
      '• Amount: *Rs.' + loanAmount.toLocaleString('en-IN') + '*\n' +
      '• Disbursement: ' + disburseStr + '\n' +
      '• First payment: *' + firstDate + '*\n' +
      '• EMI: Rs.' + emi.toLocaleString('en-IN') + '/month\n' +
      (planType === 'micro'
        ? '• Auto debit: 1st–20th each month\n• Remaining balance due by: 30th\n'
        : '') +
      '\nYou will receive a reminder before every payment. ✅',
  });
}

// ── Date Helpers ───────────────────────────────────────────────────────────
function getNextWorkingDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function getFirstEmiDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
