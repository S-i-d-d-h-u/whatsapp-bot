// src/services/otpService.js
export function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function sendOTP(phoneNumber, otp) {
  const url = 'https://www.fast2sms.com/dev/bulkV2?' + new URLSearchParams({
    authorization:    process.env.FAST2SMS_API_KEY,
    variables_values: otp,
    route:            'otp',
    numbers:          phoneNumber,   // 10 digits, no +91
  }).toString();

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'cache-control': 'no-cache' },
  });

  const data = await response.json();
  if (!data.return) throw new Error(data.message || 'Fast2SMS error');
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
