// src/index.js  — Express server entry point
import 'dotenv/config';
import express        from 'express';
import { routeMessage }   from './handlers/messageRouter.js';
import { verifyWebhook }  from './utils/verifyWebhook.js';

const app = express();
app.use(express.json());

// Meta webhook verification (GET)
app.get('/webhook', verifyWebhook);

// Incoming WhatsApp messages (POST)
app.post('/webhook', routeMessage);

// Health check
app.get('/', (_req, res) => res.send('PM SVANidhi Bot is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
