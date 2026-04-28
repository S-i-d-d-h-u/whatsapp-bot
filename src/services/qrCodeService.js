import fetch from 'node-fetch';
import fs from 'fs';
import Jimp from 'jimp';
import jsQR from 'jsqr';

// Download image from WhatsApp using media ID
async function downloadMediaFromWhatsApp(mediaId) {
  const mediaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get media URL: ${response.statusText}`);
  }

  const { url } = await response.json();
  const mediaResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });

  if (!mediaResponse.ok) {
    throw new Error(`Failed to download media: ${mediaResponse.statusText}`);
  }

  return await mediaResponse.buffer();
}

// Extract UPI ID from decoded QR string
function extractUPIFromText(text) {
  if (!text) return null;

  // Pattern 1: Full UPI URL — upi://pay?pa=user@bank&...
  const upiUrlMatch = text.match(/upi:\/\/pay\?pa=([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i);
  if (upiUrlMatch) {
    return { upiId: upiUrlMatch[1].toLowerCase(), source: 'upi_url' };
  }

  // Pattern 2: pa= parameter anywhere in the string
  const paMatch = text.match(/[?&]pa=([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i);
  if (paMatch) {
    return { upiId: paMatch[1].toLowerCase(), source: 'pa_param' };
  }

  // Pattern 3: Plain UPI ID anywhere in the string
  const plainMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9]{4,})/i);
  if (plainMatch) {
    return { upiId: plainMatch[1].toLowerCase(), source: 'plain_upi' };
  }

  return null;
}

// Main function — download image, decode QR locally, extract UPI
export async function extractQRCodeUPI(mediaId) {
  const tempFilePath = `/tmp/qr_${Date.now()}.png`;

  try {
    console.log(`[QR] Starting local extraction for media ID: ${mediaId}`);

    // Step 1: Download image from WhatsApp
    const fileBuffer = await downloadMediaFromWhatsApp(mediaId);
    fs.writeFileSync(tempFilePath, fileBuffer);
    console.log('[QR] Image downloaded');

    // Step 2: Load image with Jimp and get pixel data
    const image = await Jimp.read(tempFilePath);
    const { data, width, height } = image.bitmap;

    console.log(`[QR] Image loaded: ${width}x${height}`);

    // Step 3: Decode QR code using jsQR
    const qrCode = jsQR(data, width, height, {
      inversionAttempts: 'attemptBoth',
    });

    if (!qrCode) {
      console.log('[QR] No QR code detected in image');
      return {
        success: false,
        error: 'No QR code detected. Please send a clearer photo.',
        source: 'jsqr',
      };
    }

    console.log(`[QR] QR decoded: ${qrCode.data}`);

    // Step 4: Extract UPI ID from decoded string
    const upiResult = extractUPIFromText(qrCode.data);

    if (!upiResult) {
      console.log('[QR] QR decoded but no UPI ID found in:', qrCode.data);
      return {
        success: false,
        error: 'QR code found but does not contain a UPI ID.',
        rawData: qrCode.data,
        source: 'jsqr',
      };
    }

    console.log(`[QR] UPI extracted: ${upiResult.upiId} (${upiResult.source})`);
    return {
      success: true,
      upiId: upiResult.upiId,
      source: upiResult.source,
      confidence: 'high',
    };

  } catch (err) {
    console.error('[QR] Error:', err.message);
    return {
      success: false,
      error: err.message,
      source: 'error',
    };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// Validate UPI ID format
export function validateUPIId(upiId) {
  if (!upiId) return false;
  return /^[a-z0-9._-]{1,60}@[a-z0-9]{4,16}$/i.test(upiId);
}

export default { extractQRCodeUPI, validateUPIId };
