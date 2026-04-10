// src/services/ocrService.js  — Google Cloud Vision OCR
// FIX: this file was referenced by phase2 but never created in the project.
import fetch from 'node-fetch';
import { getMediaUrl, downloadMediaAsBase64 } from './whatsappService.js';

const VISION_API = 'https://vision.googleapis.com/v1/images:annotate';

export async function extractTextFromImage(mediaId) {
  const mediaUrl  = await getMediaUrl(mediaId);
  const base64Img = await downloadMediaAsBase64(mediaUrl);

  const res = await fetch(`${VISION_API}?key=${process.env.GOOGLE_VISION_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: base64Img },
                   features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }] }],
    }),
  });

  const { responses } = await res.json();
  const annotation    = responses?.[0];
  if (!annotation || annotation.error)
    throw new Error(annotation?.error?.message || 'Vision API returned no result');

  const fullText = annotation.fullTextAnnotation?.text || '';
  return { fullText, keyData: extractKeyFields(fullText) };
}

function extractKeyFields(text) {
  return {
    dateFound:   text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/)?.[0]        || null,
    idNumber:    text.match(/\b[A-Z]{0,2}\d{6,12}\b/)?.[0]                         || null,
    panNumber:   text.match(/[A-Z]{5}[0-9]{4}[A-Z]/)?.[0]                          || null,
    emailFound:  text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/)?.[0]                  || null,
    phoneFound:  text.match(/\+?[\d\s\-().]{7,15}/)?.[0]?.trim()                   || null,
    accountNum:  text.match(/\b\d{9,18}\b/)?.[0]                                   || null,
  };
}
