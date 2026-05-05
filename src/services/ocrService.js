// src/services/ocrService.js — Sarvam Vision OCR v3
// Uses Document Intelligence to extract text, then Sarvam chat to parse fields
import fetch from 'node-fetch';
import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { createInflateRaw } from 'zlib';
import { SarvamAIClient }   from 'sarvamai';

const client = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY || '',
});

export async function extractTextFromImage(mediaId) {
  console.log(`[OCR] Starting for mediaId: ${mediaId}`);

  // ── Step 1: Get WhatsApp media URL ───────────────────────────
  const mediaRes  = await fetch(
    `https://graph.facebook.com/v21.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const mediaData = await mediaRes.json();
  if (!mediaRes.ok || mediaData.error)
    throw new Error(`Media URL fetch failed: ${mediaData.error?.message || mediaRes.status}`);

  // ── Step 2: Download image to temp file ───────────────────────
  const imgRes = await fetch(mediaData.url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  if (!imgRes.ok) throw new Error(`Image download failed: HTTP ${imgRes.status}`);

  const buf    = Buffer.from(await imgRes.arrayBuffer());
  const mime   = mediaData.mime_type || 'image/jpeg';
  const ext    = mime.includes('png') ? '.png' : '.jpg';
  const tmpImg = path.join(os.tmpdir(), `svanidhi_${mediaId}${ext}`);
  const tmpZip = path.join(os.tmpdir(), `svanidhi_${mediaId}.zip`);
  fs.writeFileSync(tmpImg, buf);
  console.log(`[OCR] Image saved (${buf.length} bytes)`);

  let fullText = '';
  try {
    // ── Step 3: Sarvam Document Intelligence job ─────────────────
    const job = await client.documentIntelligence.createJob({
      language:     'en-IN',
      outputFormat: 'md',
    });
    console.log(`[OCR] Job: ${job.jobId}`);

    await job.uploadFile(tmpImg);
    await job.start();

    const status = await job.waitUntilComplete();
    console.log(`[OCR] State: ${status.job_state}`);

    if (status.job_state === 'Failed')
      throw new Error('Sarvam OCR job failed');

    // ── Step 4: Download ZIP and extract markdown ─────────────────
    await job.downloadOutput(tmpZip);
    fullText = await extractMarkdownFromZip(tmpZip);
    console.log(`[OCR] Raw text (${fullText.length} chars):\n${fullText.slice(0, 300)}`);

  } finally {
    try { fs.unlinkSync(tmpImg); } catch (_) {}
    try { fs.unlinkSync(tmpZip); } catch (_) {}
  }

  if (!fullText) throw new Error('No text extracted from document');

  // ── Step 5: Use Sarvam chat to parse Name, ID, DOB ────────────
  const keyData = await parseDocumentFields(fullText);
  console.log(`[OCR] Parsed fields:`, keyData);

  return { fullText, keyData };
}

// ── Use Sarvam-2B chat to extract structured fields ────────────
// This is much more reliable than regex for Indian documents
async function parseDocumentFields(rawText) {
  try {
    const prompt =
      'You are extracting personal details from an Indian identity document (Aadhaar, Voter ID, Driving Licence, Ration Card, or NREGA Job Card).\n\n' +
      'Rules:\n' +
      '1. NAME: The personal name of the card holder. IGNORE these — they are NOT names: "Government of India", "Bharat Sarkar", "Election Commission", "Ministry", "UIDAI", "भारत सरकार", "भारत निर्वाचन आयोग", any organisation or institution name. The real name is a person\'s name, usually appearing after the header lines. On Aadhaar cards it appears in the regional language first, then in English — use the English version.\n' +
      '2. IDNUMBER: The document ID number. For Aadhaar it is 12 digits in groups of 4 (e.g. 8416 1590 3267). For Voter ID it is like ABC1234567. Include exactly as printed.\n' +
      '3. DOB: Date of birth in DD-MM-YYYY format. It may appear as DOB:, Date of Birth:, பிறந்த நாள், जन्म तिथि, etc.\n\n' +
      'Return ONLY a JSON object: {"name": "...", "idNumber": "...", "dob": "..."}\n' +
      'Use null for any field not found. No explanation, no markdown, just the JSON.\n\n' +
      'Document text:\n' + rawText.slice(0, 1000);

    const res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':          'application/json',
        'api-subscription-key':  process.env.SARVAM_API_KEY || '',
      },
      body: JSON.stringify({
        model:       'sarvam-m',
        messages:    [{ role: 'user', content: prompt }],
        max_tokens:  150,
        temperature: 0,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log(`[OCR] Chat response: ${content}`);

    // Strip markdown code fences if present
    const clean = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      name:       parsed.name       || null,
      idNumber:   parsed.idNumber   || parsed.id_number || null,
      dob:        parsed.dob        || null,
      dateFound:  parsed.dob        || regexDate(rawText),
      panNumber:  regexPAN(rawText),
      phoneFound: regexPhone(rawText),
      accountNum: regexAccount(rawText),
    };
  } catch (err) {
    console.error('[OCR] Chat parse failed, falling back to regex:', err.message);
    // Fallback to regex if chat API fails
    return regexFallback(rawText);
  }
}

// ── Regex fallback ─────────────────────────────────────────────
// Lines that are headers/labels — never a person's name
const SKIP_LINES = [
  'government of india', 'bharat sarkar', 'election commission of india',
  'election commission', 'ministry of', 'uidai', 'unique identification',
  'income tax department', 'driving licence', 'driving license',
  'motor vehicles', 'transport department', 'ration card',
  'national rural employment', 'nrega', 'mahatma gandhi',
  'republic of india', 'india', 'male', 'female', 'transgender',
  'aadhaar', 'aadhar', 'voter id', 'epic',
];

function isHeaderLine(line) {
  const lower = line.toLowerCase();
  return SKIP_LINES.some(skip => lower.includes(skip));
}

function regexFallback(text) {
  // Aadhaar: 12 digits in groups of 4 (e.g. 1234 5678 9012)
  const aadhaarMatch = text.match(/\b\d{4}\s\d{4}\s\d{4}\b/);
  // Voter ID: 3 letters + 7 digits (e.g. ABC1234567)
  const voterMatch   = text.match(/\b[A-Z]{3}\d{7}\b/);
  // Driving licence
  const dlMatch      = text.match(/[A-Z]{2}[\-\s]?\d{2}[\-\s]?\d{4}[\-\s]?\d{7}\b/i);

  // Name: find English name line — skip known headers, skip lines with digits,
  // skip single words, look for 2+ word lines that look like a person's name
  const lines = text.split('\n')
    .map(l => l.replace(/\*\*/g,'').replace(/[*_#]/g,'').trim())
    .filter(Boolean);

  const nameLine = lines.find(l =>
    /^[A-Za-z][A-Za-z\s\.]{4,39}$/.test(l) &&   // only letters, spaces, dots
    l.split(/\s+/).length >= 2 &&                   // at least 2 words
    !isHeaderLine(l) &&                              // not a header
    !/\d/.test(l) &&                                 // no digits
    !/^(DOB|Date|Male|Female|S\/O|D\/O|W\/O)/i.test(l) // not a label
  ) || null;

  return {
    name:       nameLine,
    idNumber:   aadhaarMatch?.[0] || voterMatch?.[0] || dlMatch?.[0] || regexIdNumber(text),
    dob:        regexDate(text),
    dateFound:  regexDate(text),
    panNumber:  regexPAN(text),
    phoneFound: regexPhone(text),
    accountNum: regexAccount(text),
  };
}

function regexDate(t)    { return t.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/)?.[0] || null; }
function regexIdNumber(t){ return t.match(/\b[A-Z]{0,2}\d{6,12}\b/)?.[0] || null; }
function regexPAN(t)     { return t.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/)?.[0] || null; }
function regexPhone(t)   { return t.match(/\b[6-9]\d{9}\b/)?.[0] || null; }
function regexAccount(t) { return t.match(/\b\d{9,18}\b/)?.[0] || null; }

// ── Parse ZIP and extract .md content ─────────────────────────
async function extractMarkdownFromZip(zipPath) {
  const zip = fs.readFileSync(zipPath);
  let text = '';
  let offset = 0;

  while (offset < zip.length - 4) {
    if (zip[offset]   !== 0x50 || zip[offset+1] !== 0x4B ||
        zip[offset+2] !== 0x03 || zip[offset+3] !== 0x04) {
      offset++; continue;
    }
    const compression    = zip.readUInt16LE(offset + 8);
    const compressedSz   = zip.readUInt32LE(offset + 18);
    const fileNameLen    = zip.readUInt16LE(offset + 26);
    const extraLen       = zip.readUInt16LE(offset + 28);
    const fileName       = zip.slice(offset + 30, offset + 30 + fileNameLen).toString('utf8');
    const dataOffset     = offset + 30 + fileNameLen + extraLen;
    const compressed     = zip.slice(dataOffset, dataOffset + compressedSz);

    if (fileName.endsWith('.md') || fileName.endsWith('.txt')) {
      let content = '';
      if (compression === 0) {
        content = compressed.toString('utf8');
      } else if (compression === 8) {
        content = await new Promise((res, rej) => {
          const chunks = [];
          const inf = createInflateRaw();
          inf.on('data', c => chunks.push(c));
          inf.on('end',  () => res(Buffer.concat(chunks).toString('utf8')));
          inf.on('error', rej);
          inf.write(compressed); inf.end();
        });
      }
      console.log(`[OCR] File: ${fileName} → ${content.length} chars`);
      text += content + '\n';
    }
    offset = dataOffset + compressedSz;
  }
  return text.trim();
}

