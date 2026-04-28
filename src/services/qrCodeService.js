import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import { createReadStream } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SARVAM_API_KEY = process.env.SARVAM_API_KEY;
const SARVAM_BASE_URL = 'https://api.sarvam.ai';

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Download media from WhatsApp (reuse from your existing ocrService)
export async function downloadMediaFromWhatsApp(mediaId) {
  try {
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
  } catch (err) {
    console.error('Error downloading media from WhatsApp:', err.message);
    throw err;
  }
}

// Extract markdown from Sarvam ZIP output (reuse from your existing code)
async function extractMarkdownFromZip(zipUrl) {
  try {
    const zipResponse = await fetch(zipUrl);
    const zipBuffer = await zipResponse.buffer();

    // Simple ZIP extraction using zlib (as per your existing implementation)
    const zlib = await import('zlib');
    const inflateRaw = require('util').promisify(zlib.inflateRaw);

    // Find the .md file in the ZIP (basic parsing)
    let mdContent = '';
    const zipContent = zipBuffer.toString('binary');
    const mdMatch = zipContent.match(/(.+\.md)/);

    if (mdMatch) {
      // Extract and decompress (simplified - use proper ZIP parser for production)
      const extracted = await inflateRaw(zipBuffer);
      mdContent = extracted.toString('utf-8');
    }

    return mdContent;
  } catch (err) {
    console.error('Error extracting markdown from ZIP:', err.message);
    throw err;
  }
}

// Regex-based UPI extraction (primary method for QR codes)
function extractUPIFromText(text) {
  // Pattern 1: Standard UPI URL format: upi://pay?pa=user@bank
  const upiUrlPattern = /upi:\/\/pay\?pa=([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i;
  const upiUrlMatch = text.match(upiUrlPattern);

  if (upiUrlMatch && upiUrlMatch[1]) {
    return {
      source: 'upi_url',
      upiId: upiUrlMatch[1].toLowerCase(),
    };
  }

  // Pattern 2: Direct UPI ID format: user@bank
  const upiIdPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)(?:\s|$|\n|&)/i;
  const upiIdMatch = text.match(upiIdPattern);

  if (upiIdMatch && upiIdMatch[1]) {
    return {
      source: 'direct_upi',
      upiId: upiIdMatch[1].toLowerCase(),
    };
  }

  return null;
}

// Sarvam Chat model to extract UPI from OCR text
async function extractUPIWithSarvamChat(ocrText) {
  try {
    const response = await fetch(`${SARVAM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sarvam-m',
        messages: [
          {
            role: 'user',
            content: `You are a UPI ID extractor. From the following OCR text of a QR code image, extract the UPI ID.

UPI IDs are in the format: username@bankcode (e.g., john@okhdfcbank, merchant@airtel)

Instructions:
1. Look for patterns like "user@bank" or "upi://pay?pa=user@bank"
2. Ignore any headers, organization names, or metadata
3. Return ONLY the UPI ID in format "user@bank" (lowercase)
4. If no UPI ID is found, respond with EXACTLY: "NOTFOUND"

OCR Text:
${ocrText}

UPI ID:`,
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sarvam chat API error: ${response.statusText}`);
    }

    const data = await response.json();
    const extractedId = data.choices[0].message.content.trim();

    if (extractedId && extractedId !== 'NOTFOUND') {
      return {
        source: 'sarvam_chat',
        upiId: extractedId.toLowerCase(),
      };
    }

    return null;
  } catch (err) {
    console.error('Error calling Sarvam chat model:', err.message);
    return null;
  }
}

// Main QR code extraction function
export async function extractQRCodeUPI(mediaId) {
  const tempFilePath = `/tmp/qr_${Date.now()}.png`;

  try {
    console.log(`[QR] Starting extraction for media ID: ${mediaId}`);

    // Step 1: Download the image from WhatsApp
    console.log('[QR] Downloading image from WhatsApp...');
    const fileBuffer = await downloadMediaFromWhatsApp(mediaId);
    fs.writeFileSync(tempFilePath, fileBuffer);
    console.log('[QR] Image saved to temp file');

    // Step 2: Create Sarvam Document Intelligence job
    console.log('[QR] Creating Sarvam Document Intelligence job...');
    const jobResponse = await fetch(`${SARVAM_BASE_URL}/jobs`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        modelId: 'doc-intelligence',
        language: 'en-IN',
        outputFormat: 'md',
      }),
    });

    if (!jobResponse.ok) {
      throw new Error(`Failed to create Sarvam job: ${jobResponse.statusText}`);
    }

    const jobData = await jobResponse.json();
    const jobId = jobData.jobId;
    console.log(`[QR] Job created: ${jobId}`);

    // Step 3: Upload image to the job
    console.log('[QR] Uploading image to job...');
    const uploadForm = new FormData();
    uploadForm.append('file', createReadStream(tempFilePath));

    const uploadResponse = await fetch(`${SARVAM_BASE_URL}/jobs/${jobId}/files`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
      },
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload file: ${uploadResponse.statusText}`);
    }

    console.log('[QR] Image uploaded');

    // Step 4: Start the job
    console.log('[QR] Starting Sarvam job...');
    const runResponse = await fetch(`${SARVAM_BASE_URL}/jobs/${jobId}/run`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
      },
    });

    if (!runResponse.ok) {
      throw new Error(`Failed to start job: ${runResponse.statusText}`);
    }

    console.log('[QR] Job started, polling for completion...');

    // Step 5: Poll for job completion (max 30 seconds)
    let jobStatus = 'PROCESSING';
    let outputZip = null;
    let pollCount = 0;
    const maxPolls = 15; // 30 seconds max (2s interval)

    while (jobStatus !== 'COMPLETED' && pollCount < maxPolls) {
      await sleep(2000);
      pollCount++;

      const statusResponse = await fetch(`${SARVAM_BASE_URL}/jobs/${jobId}`, {
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to get job status: ${statusResponse.statusText}`);
      }

      const statusData = await statusResponse.json();
      jobStatus = statusData.status;

      console.log(`[QR] Job status: ${jobStatus} (poll ${pollCount}/${maxPolls})`);

      if (jobStatus === 'COMPLETED') {
        outputZip = statusData.outputZip;
      } else if (jobStatus === 'FAILED') {
        throw new Error(`Sarvam job failed: ${statusData.error}`);
      }
    }

    if (!outputZip) {
      throw new Error(`Job did not complete within timeout (${maxPolls * 2}s)`);
    }

    // Step 6: Extract OCR text from ZIP
    console.log('[QR] Extracting OCR text from output...');
    const ocrText = await extractMarkdownFromZip(outputZip);
    console.log(`[QR] OCR text extracted (${ocrText.length} chars)`);

    // Step 7: Try to extract UPI using regex first (fastest)
    console.log('[QR] Attempting regex-based UPI extraction...');
    const regexResult = extractUPIFromText(ocrText);

    if (regexResult) {
      console.log(`[QR] UPI extracted via regex: ${regexResult.upiId}`);
      return {
        success: true,
        upiId: regexResult.upiId,
        source: regexResult.source,
        ocrText: ocrText.substring(0, 500), // Return partial OCR for debugging
        confidence: 'high',
      };
    }

    // Step 8: Fallback to Sarvam chat model if regex didn't work
    console.log('[QR] Regex failed, trying Sarvam chat model...');
    const chatResult = await extractUPIWithSarvamChat(ocrText);

    if (chatResult) {
      console.log(`[QR] UPI extracted via chat model: ${chatResult.upiId}`);
      return {
        success: true,
        upiId: chatResult.upiId,
        source: chatResult.source,
        ocrText: ocrText.substring(0, 500),
        confidence: 'medium',
      };
    }

    // Step 9: If both methods fail, return raw OCR text for manual review
    console.log('[QR] Both extraction methods failed, returning raw OCR');
    return {
      success: false,
      error: 'Could not extract UPI ID from QR code',
      ocrText: ocrText,
      source: 'none',
      requiresManualReview: true,
    };

  } catch (err) {
    console.error('[QR] Error in extractQRCodeUPI:', err.message);
    return {
      success: false,
      error: err.message,
      source: 'error',
    };
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log('[QR] Temp file cleaned up');
    }
  }
}

// Validate extracted UPI ID format
export function validateUPIId(upiId) {
  if (!upiId) return false;

  // UPI ID format: username@bankcode
  // username: alphanumeric, dots, hyphens, underscores (max 60 chars)
  // bankcode: alphanumeric (typically 4-16 chars)
  const upiPattern = /^[a-z0-9._-]{1,60}@[a-z0-9]{4,16}$/i;
  return upiPattern.test(upiId);
}

// For testing/debugging: extract UPI from a local file
export async function extractQRCodeUPIFromFile(filePath) {
  const tempFile = `/tmp/qr_test_${Date.now()}.png`;

  try {
    fs.copyFileSync(filePath, tempFile);
    const result = await extractQRCodeUPI(tempFile);
    return result;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

export default {
  extractQRCodeUPI,
  validateUPIId,
  extractQRCodeUPIFromFile,
  extractUPIFromText,
};
