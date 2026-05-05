// src/services/otpService.js
export function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function sendOTP(phoneNumber, otp) {
  const apiKey = process.env.TWOFACTOR_API_KEY;

  const response = await fetch(
    `https://2factor.in/API/V1/${apiKey}/SMS/${phoneNumber}/${otp}/PM%20SVANidhi%20OTP`,
    { method: 'GET' }
  );

  const data = await response.json();
  if (data.Status !== 'Success') throw new Error(data.Details || '2Factor error');
  return true;
}

export async function sendOTPVoice(phoneNumber, otp) {
  const apiKey = process.env.TWOFACTOR_API_KEY;

  // Spell out digits with pauses for clearer IVR delivery e.g. "1 2 3 4"
  const spokenOtp = otp.split('').join(' ');
  const url = `https://2factor.in/API/V1/${apiKey}/VOICE/${phoneNumber}/PM%20SVANidhi%20OTP/${encodeURIComponent(spokenOtp)}`;
  console.log('[2Factor VOICE url]', url);

  const response = await fetch(url, { method: 'GET' });
  const rawText  = await response.text();
  console.log('[2Factor VOICE raw]', rawText);

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error('2Factor returned non-JSON: ' + rawText.slice(0, 100)); }

  if (data.Status !== 'Success') throw new Error(data.Details || '2Factor Voice error');
  return true;
export function verifyOTP(sessionData, enteredOTP) {
  if (!sessionData.otpCode || !sessionData.otpExpiry)
    return { valid: false, reason: 'no_otp' };
  if (Date.now() > sessionData.otpExpiry)
    return { valid: false, reason: 'expired' };
  if (sessionData.otpCode !== enteredOTP.trim())
    return { valid: false, reason: 'wrong' };
  return { valid: true };
}
