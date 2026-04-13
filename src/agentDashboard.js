// src/agentDashboard.js
// ─── Agent dashboard Express router ───────────────────────────────────────
// Serves the HTML dashboard at GET /agent
// Exposes two API endpoints:
//   GET  /agent/session/:phone  — read vendor's current state
//   POST /agent/action          — submit an action on vendor's behalf

import express                         from 'express';
import path                            from 'path';
import { fileURLToPath }               from 'url';
import { getSession }                  from './utils/sessionManager.js';
import { routeAgentAction, getStateLabel } from './handlers/agentHandler.js';

export const agentRouter = express.Router();

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || 'svanidhi2024';

// ── GET /agent — serve the dashboard (password protected) ─────────────────
agentRouter.get('/', (req, res) => {
  if (req.query.pass !== AGENT_PASSWORD) {
    return res.status(401).send(`
      <!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Agent Login — PM SVANidhi</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;
               align-items:center;justify-content:center;min-height:100vh}
          .card{background:#fff;border-radius:12px;padding:32px;width:360px;
                box-shadow:0 2px 12px rgba(0,0,0,.08)}
          h1{font-size:20px;font-weight:600;margin-bottom:4px;color:#111}
          p{font-size:13px;color:#777;margin-bottom:24px}
          input{width:100%;padding:10px 12px;font-size:15px;border:1px solid #ddd;
                border-radius:8px;margin-bottom:12px;outline:none}
          input:focus{border-color:#1D9E75}
          button{width:100%;padding:12px;font-size:15px;font-weight:500;
                 background:#1D9E75;color:#fff;border:none;border-radius:8px;cursor:pointer}
          button:hover{background:#0F6E56}
        </style>
      </head><body>
        <div class="card">
          <h1>PM SVANidhi</h1>
          <p>Agent Dashboard — enter your password to continue</p>
          <form method="GET" action="/agent">
            <input type="password" name="pass" placeholder="Password" autofocus/>
            <button type="submit">Login</button>
          </form>
        </div>
      </body></html>
    `);
  }
  res.sendFile(path.join(__dirname, 'agentUI.html'));
});

// ── GET /agent/session/:phone — return vendor session as JSON ──────────────
agentRouter.get('/session/:phone', (req, res) => {
  let phone = req.params.phone.replace(/\D/g, ''); // strip non-digits
  if (phone.length === 10) phone = `91${phone}`;   // add India country code
  const session    = getSession(phone);
  const stateInfo  = getStateLabel(session.state);
  res.json({ phone, state: session.state, stateInfo, data: session.data });
});

// ── POST /agent/action — execute an action on vendor's behalf ──────────────
agentRouter.post('/action', async (req, res) => {
  let { vendorPhone, action, value } = req.body;
  if (!vendorPhone || !action) {
    return res.status(400).json({ ok: false, error: 'vendorPhone and action are required' });
  }
  vendorPhone = vendorPhone.replace(/\D/g, '');
  if (vendorPhone.length === 10) vendorPhone = `91${vendorPhone}`;

  try {
    await routeAgentAction(vendorPhone, action, value);
    const updated   = getSession(vendorPhone);
    const stateInfo = getStateLabel(updated.state);
    res.json({ ok: true, newState: updated.state, stateInfo });
  } catch (err) {
    console.error('[Agent action error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});
