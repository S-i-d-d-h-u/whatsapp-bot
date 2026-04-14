// src/services/ocrService.js  — Google Cloud Vision OCR
import fetch from 'node-fetch';

const VISION_API = 'https://vision.googleapis.com/v1/images:annotate';

export async function extractTextFromImage(mediaId) {

  // Step 1: Get the media download URL from WhatsApp
  console.log(`[OCR] Getting media URL for mediaId: ${mediaId}`);
  const mediaRes  = await fetch(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const mediaData = await mediaRes.json();

  console.log(`[OCR] Media API status: ${mediaRes.status}`);

  if (!mediaRes.ok || mediaData.error) {
    const msg = mediaData.error?.message || `HTTP ${mediaRes.status}`;
    console.error(`[OCR] Media URL fetch failed: ${msg}`);
    throw new Error(`Media URL fetch failed: ${msg}`);
  }

  const mediaUrl = mediaData.url;
  if (!mediaUrl) throw new Error('No media URL in WhatsApp response');

  // Step 2: Download image bytes
  console.log(`[OCR] Downloading image...`);
  const imgRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });

  console.log(`[OCR] Image download status: ${imgRes.status}`);
  if (!imgRes.ok) throw new Error(`Image download failed: HTTP ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const base64Img   = Buffer.from(arrayBuffer).toString('base64');
  console.log(`[OCR] Image ready (${base64Img.length} chars), calling Vision API...`);

  // Step 3: Google Vision API
  const visionRes  = await fetch(`${VISION_API}?key=${process.env.GOOGLE_VISION_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image:    { content: base64Img },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }],
      }],
    }),
  });

  const visionData = await visionRes.json();
  console.log(`[OCR] Vision API status: ${visionRes.status}`);

  if (!visionRes.ok) throw new Error(`Vision API error: HTTP ${visionRes.status}`);

  const annotation = visionData.responses?.[0];
  if (annotation?.error) throw new Error(annotation.error.message);

  const fullText = annotation?.fullTextAnnotation?.text || '';
  console.log(`[OCR] Extracted ${fullText.length} characters`);

  return { fullText, keyData: extractKeyFields(fullText) };
}

function extractKeyFields(text) {
  return {
    dateFound:   text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/)?.[0]  || null,
    idNumber:    text.match(/\b[A-Z]{0,2}\d{6,12}\b/)?.[0]                   || null,
    panNumber:   text.match(/[A-Z]{5}[0-9]{4}[A-Z]/)?.[0]                    || null,
    emailFound:  text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/)?.[0]            || null,
    phoneFound:  text.match(/\+?[\d\s\-().]{7,15}/)?.[0]?.trim()             || null,
    accountNum:  text.match(/\b\d{9,18}\b/)?.[0]                             || null,
  };
}
