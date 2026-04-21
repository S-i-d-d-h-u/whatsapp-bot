// src/agentDashboard.js  — Agent dashboard Express router (v2)
import express                              from 'express';
import path                                 from 'path';
import { fileURLToPath }                    from 'url';
import { getSession }                       from './utils/sessionManager.js';
import { routeAgentAction, getStateLabel }  from './handlers/agentHandler.js';

export const agentRouter = express.Router();

const __dirname      = path.dirname(fileURLToPath(import.meta.url));
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || 'svanidhi2024';

// GET /agent — serve dashboard HTML
agentRouter.get('/', (req, res) => {
  if (req.query.pass !== AGENT_PASSWORD) {
    return res.status(401).send(`
      <!DOCTYPE html><html><head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Agent Login</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:system-ui,sans-serif;background:#0f4025;display:flex;
               align-items:center;justify-content:center;min-height:100vh}
          .card{background:#fff;border-radius:14px;padding:32px;width:320px;text-align:center}
          h1{font-size:20px;font-weight:700;margin-bottom:4px}
          p{font-size:13px;color:#666;margin-bottom:20px}
          input{width:100%;padding:10px;font-size:14px;border:1.5px solid #ddd;
                border-radius:8px;margin-bottom:12px;outline:none}
          input:focus{border-color:#1a6e3c}
          button{width:100%;padding:12px;background:#1a6e3c;color:#fff;
                 border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
        </style>
      </head><body>
        <div class="card">
          <h1>PM SVANidhi</h1>
          <p>Agent Dashboard — enter password</p>
          <form method="GET" action="/agent">
            <input type="password" name="pass" placeholder="Password" autofocus/>
            <button type="submit">Login →</button>
          </form>
        </div>
      </body></html>
    `);
  }
  res.sendFile(path.join(__dirname, 'agentUI.html'));
});

// GET /agent/session/:phone — read vendor session
agentRouter.get('/session/:phone', (req, res) => {
  let phone = req.params.phone.replace(/\D/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const session   = getSession(phone);
  const stateInfo = getStateLabel(session.state);
  res.json({ phone, state: session.state, stateInfo, data: session.data });
});

// POST /agent/action — execute agent action
agentRouter.post('/action', async (req, res) => {
  let { vendorPhone, action, value } = req.body;
  if (!vendorPhone || !action) {
    return res.status(400).json({ ok: false, error: 'vendorPhone and action required' });
  }
  vendorPhone = vendorPhone.replace(/\D/g, '');
  if (vendorPhone.length === 10) vendorPhone = '91' + vendorPhone;
  try {
    await routeAgentAction(vendorPhone, action, value);
    const updated   = getSession(vendorPhone);
    const stateInfo = getStateLabel(updated.state);
    res.json({ ok: true, newState: updated.state, stateInfo });
  } catch (err) {
    console.error('[Agent error]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});
