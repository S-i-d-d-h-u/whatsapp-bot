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
export function verifyOTP(sessionData, enteredOTP) {
  if (!sessionData.otpCode || !sessionData.otpExpiry)
    return { valid: false, reason: 'no_otp' };
  if (Date.now() > sessionData.otpExpiry)
    return { valid: false, reason: 'expired' };
  if (sessionData.otpCode !== enteredOTP.trim())
    return { valid: false, reason: 'wrong' };
  return { valid: true };
}
