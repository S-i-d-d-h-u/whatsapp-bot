// src/services/ocrService.js — Sarvam Vision OCR (replaces Google Vision)
// Uses Sarvam's Document Intelligence job API which accepts JPG/PNG images
import fetch    from 'node-fetch';
import fs       from 'fs';
import path     from 'path';
import os       from 'os';
import { SarvamAIClient } from 'sarvamai';

const client = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY || '',
});

export async function extractTextFromImage(mediaId) {
  console.log(`[OCR-Sarvam] Starting for mediaId: ${mediaId}`);

  // ── Step 1: Get media URL from WhatsApp ──────────────────────
  const mediaRes  = await fetch(
    `https://graph.facebook.com/v21.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const mediaData = await mediaRes.json();
  if (!mediaRes.ok || mediaData.error) {
    throw new Error(`Media URL fetch failed: ${mediaData.error?.message || mediaRes.status}`);
  }
  const mediaUrl = mediaData.url;
  if (!mediaUrl) throw new Error('No media URL in WhatsApp response');

  // ── Step 2: Download image to a temp file ────────────────────
  const imgRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  if (!imgRes.ok) throw new Error(`Image download failed: HTTP ${imgRes.status}`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  // Detect mime type from buffer header to set correct extension
  const mime = mediaData.mime_type || 'image/jpeg';
  const ext  = mime.includes('png') ? '.png' : '.jpg';
  const tmpPath = path.join(os.tmpdir(), `svanidhi_ocr_${mediaId}${ext}`);

  fs.writeFileSync(tmpPath, buffer);
  console.log(`[OCR-Sarvam] Image saved to ${tmpPath} (${buffer.length} bytes)`);

  try {
    // ── Step 3: Create Sarvam Document Intelligence job ────────
    // Language: en-IN works for all OVDs (Aadhaar, Voter ID etc)
    // which are in English or bilingual (English + regional language)
    const job = await client.documentIntelligence.createJob({
      language:     'en-IN',
      outputFormat: 'md',
    });
    console.log(`[OCR-Sarvam] Job created: ${job.jobId}`);

    // ── Step 4: Upload the image file ──────────────────────────
    await job.uploadFile(tmpPath);
    console.log(`[OCR-Sarvam] File uploaded`);

    // ── Step 5: Start processing ───────────────────────────────
    await job.start();
    console.log(`[OCR-Sarvam] Job started`);

    // ── Step 6: Wait for completion (timeout 30s) ──────────────
    const status = await job.waitUntilComplete();
    console.log(`[OCR-Sarvam] Job state: ${status.job_state}`);

    if (status.job_state !== 'COMPLETED') {
      throw new Error(`Sarvam OCR job ended with state: ${status.job_state}`);
    }

    // ── Step 7: Get output text ─────────────────────────────────
    // The markdown output contains the extracted text
    const metrics = job.getPageMetrics();
    const pages   = metrics?.pages || [];

    // Reconstruct full text from page data
    let fullText = '';
    if (pages.length > 0) {
      fullText = pages.map(p => p.markdown || p.text || '').join('\n').trim();
    }

    // Fallback: try downloading output ZIP and reading the markdown
    if (!fullText) {
      const outPath = path.join(os.tmpdir(), `svanidhi_ocr_out_${mediaId}.zip`);
      try {
        await job.downloadOutput(outPath);
        // Extract markdown from zip using native Node.js
        // (simple approach: read the zip bytes and find text between common markers)
        const zipBuf = fs.readFileSync(outPath);
        // The zip contains a .md file — extract its content as text
        fullText = extractTextFromZip(zipBuf);
        fs.unlinkSync(outPath);
      } catch (zipErr) {
        console.error('[OCR-Sarvam] ZIP extraction failed:', zipErr.message);
      }
    }

    console.log(`[OCR-Sarvam] Extracted ${fullText.length} characters`);
    return { fullText, keyData: extractKeyFields(fullText) };

  } finally {
    // Always clean up the temp file
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

// ── Extract text from Sarvam's output ZIP ─────────────────────
// The ZIP contains a single .md file with the OCR output
// We do a simple byte search for readable text since we don't
// want to add a zip library dependency
function extractTextFromZip(zipBuffer) {
  // ZIP local file headers start with PK\x03\x04
  // Find the deflated content after the header
  const text = zipBuffer.toString('utf8', 0, zipBuffer.length);
  // Pull out anything that looks like readable text (alphanumeric + common punctuation)
  const readable = text.replace(/[^\x20-\x7E\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
  // Return the longest continuous readable segment
  const segments = readable.split(/\s{5,}/);
  return segments.sort((a,b) => b.length - a.length)[0] || '';
}

// ── Extract key fields from OCR text ──────────────────────────
function extractKeyFields(text) {
  return {
    dateFound:  text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/)?.[0]  || null,
    idNumber:   text.match(/\b[A-Z]{0,2}\d{6,12}\b/)?.[0]                   || null,
    panNumber:  text.match(/[A-Z]{5}[0-9]{4}[A-Z]/)?.[0]                    || null,
    emailFound: text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/)?.[0]            || null,
    phoneFound: text.match(/\+?[\d\s\-().]{7,15}/)?.[0]?.trim()             || null,
    accountNum: text.match(/\b\d{9,18}\b/)?.[0]                             || null,
  };
}
