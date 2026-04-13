// src/index.js  — Express server entry point
import 'dotenv/config';
import express             from 'express';
import path                from 'path';
import { fileURLToPath }   from 'url';
import { routeMessage }    from './handlers/messageRouter.js';
import { verifyWebhook }   from './utils/verifyWebhook.js';
import { agentRouter }     from './agentDashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Serve static files from src/ directory (needed for agentUI.html)
app.use(express.static(__dirname));

// Meta webhook verification (GET)
app.get('/webhook', verifyWebhook);

// Incoming WhatsApp messages (POST)
app.post('/webhook', routeMessage);

// Agent dashboard (protected by AGENT_PASSWORD)
app.use('/agent', agentRouter);

// Health check
app.get('/', (_req, res) => res.send('PM SVANidhi Bot is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
