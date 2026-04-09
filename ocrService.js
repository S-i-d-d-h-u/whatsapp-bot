// services/ocrService.js
// ─── Google Cloud Vision API integration ──────────────────────────────────
// Reference: https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate
import fetch from 'node-fetch';
import { CONFIG } from '../../config/constants.js';
import { getMediaUrl, downloadMedia } from './whatsappService.js';

/**
 * extractTextFromImage
 * ─────────────────────
 * 1. Resolve the WhatsApp media ID → download URL
 * 2. Download the image as base64
 * 3. Send to Vision API with TEXT_DETECTION feature
 * 4. Return structured extraction result
 *
 * @param {string} mediaId - WhatsApp media object ID from the incoming message
 * @returns {{ fullText: string, lines: string[], keyData: Object }}
 */
export async function extractTextFromImage(mediaId) {
  // Step 1 & 2: Download image from WhatsApp servers
  const mediaUrl  = await getMediaUrl(mediaId);
  const base64Img = await downloadMedia(mediaUrl);

  // Step 3: Call Vision API
  const visionRes = await fetch(
    `${CONFIG.VISION_API_BASE}?key=${CONFIG.GOOGLE_VISION_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Img },
            features: [
              { type: 'TEXT_DETECTION',          maxResults: 1  },
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1  },
            ],
          },
        ],
      }),
    }
  );

  const { responses } = await visionRes.json();
  const annotation    = responses?.[0];

  if (!annotation || annotation.error) {
    throw new Error(annotation?.error?.message || 'Vision API returned no results');
  }

  const fullText = annotation.fullTextAnnotation?.text || '';
  const lines    = fullText.split('\n').filter(Boolean);

  // Step 4: Extract common document fields (name, date, ID number)
  const keyData = extractKeyFields(lines);

  return { fullText, lines, keyData };
}

/**
 * extractKeyFields
 * ─────────────────
 * Regex-based extractor for common document fields.
 * Extend this with your own patterns as needed.
 */
function extractKeyFields(lines) {
  const joined = lines.join(' ');
  return {
    dateFound:   joined.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/)?.[0]  || null,
    idNumber:    joined.match(/\b[A-Z]{0,2}\d{6,12}\b/)?.[0]                  || null,
    emailFound:  joined.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/)?.[0]           || null,
    phoneFound:  joined.match(/\+?[\d\s\-().]{7,15}/)?.[0]?.trim()            || null,
    amountFound: joined.match(/[$€£₹]?\s?\d{1,3}(?:[,]\d{3})*(?:\.\d{2})?/)?.[0] || null,
  };
}

/**
 * formatOCRResult
 * ────────────────
 * Build a human-readable WhatsApp reply from the OCR result.
 */
export function formatOCRResult({ fullText, keyData }) {
  const fields = Object.entries(keyData)
    .filter(([, v]) => v)
    .map(([k, v]) => `• *${k.replace('Found', '')}:* ${v}`)
    .join('\n');

  return [
    '✅ *Document Scan Complete*',
    '',
    '📋 *Extracted Text:*',
    fullText.slice(0, 600) + (fullText.length > 600 ? '...' : ''),
    '',
    fields ? `🔍 *Key Fields Detected:*\n${fields}` : '',
  ].filter(Boolean).join('\n');
}
