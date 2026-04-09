import express from 'express';
import { router as webhookRouter } from './handlers/webhook.js';
import { verifyWebhook } from './utils/verifyWebhook.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// ─── Webhook Verification (GET) ───────────────────────────────────────────────
app.get('/webhook', verifyWebhook);

// ─── Incoming Message Handler (POST) ─────────────────────────────────────────
app.use('/webhook', webhookRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('WhatsApp Bot is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
