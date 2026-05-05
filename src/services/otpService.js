// src/services/otpService.js

export function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// SMS — used by call agent / assisted flow
// Caller passes the OTP to send
export async function sendOTP(phoneNumber, otp) {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  const url    = `https://2factor.in/API/V1/${apiKey}/SMS/${phoneNumber}/${otp}/PM%20SVANidhi%20OTP`;

  console.log('[2Factor SMS url]', url);

  const response = await fetch(url, { method: 'GET' });
  const rawText  = await response.text();
  console.log('[2Factor SMS raw]', rawText);

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error('2Factor SMS returned non-JSON: ' + rawText.slice(0, 100)); }

  if (data.Status !== 'Success') throw new Error(data.Details || '2Factor SMS error');
  return true;
}

// IVR Voice Call — used by solo self-avail flow
// 2Factor auto-generates and speaks the OTP — returns the OTP string so caller can store it
// Sends OTP via voice call — caller passes the OTP, 2Factor speaks it
export async function sendOTPVoice(phoneNumber, otp) {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  const url    = `https://2factor.in/API/V1/${apiKey}/VOICE/${phoneNumber}/AUTOGEN2/${otp}`;

  console.log('[2Factor VOICE url]', url);

  const response = await fetch(url, { method: 'GET' });
  const rawText  = await response.text();
  console.log('[2Factor VOICE raw]', rawText);

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error('2Factor VOICE returned non-JSON: ' + rawText.slice(0, 100)); }

  if (data.Status !== 'Success') throw new Error(data.Details || '2Factor Voice error');
  return true;
}
export function verifyOTP(sessionData, enteredOTP) {
  if (!sessionData.otpCode || !sessionData.otpExpiry)
    return { valid: false, reason: 'no_otp' };
  if (Date.now() > sessionData.otpExpiry)
    return { valid: false, reason: 'expired' };
  if (sessionData.otpCode !== enteredOTP.trim())
    return { valid: false, reason: 'wrong' };
  return { valid: true };
}
