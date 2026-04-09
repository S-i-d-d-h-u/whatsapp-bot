# WhatsApp Chatbot 🤖

A production-ready WhatsApp bot built on the **Meta Cloud API** featuring interactive menus, OCR document scanning via Google Vision, and video call link generation.

---

## Features

| Feature | Implementation |
|---|---|
| Interactive menus | WhatsApp List Messages |
| Quick replies | Reply Buttons (≤3 options) |
| Document OCR | Google Cloud Vision API |
| Video Call bypass | Jitsi Meet link generator |
| Session state | In-memory (swap Redis for prod) |

---

## Project Structure

```
whatsapp-bot/
├── config/
│   └── constants.js          # All env vars and menu IDs
├── src/
│   ├── index.js               # Express server entry point
│   ├── handlers/
│   │   ├── webhook.js         # Express router for /webhook
│   │   ├── messageRouter.js   # Dispatches by message type
│   │   ├── textHandler.js     # Plain text → main menu
│   │   ├── interactiveHandler.js # List/button replies
│   │   └── imageHandler.js    # OCR flow
│   ├── services/
│   │   ├── whatsappService.js # All WA Cloud API calls
│   │   ├── ocrService.js      # Google Vision integration
│   │   └── meetingService.js  # Video call link generator
│   └── utils/
│       ├── verifyWebhook.js   # Meta webhook handshake
│       └── sessionManager.js  # Per-user state tracking
├── .env.example
├── package.json
└── render.yaml
```

---

## Prerequisites

1. **Meta Developer Account** — [developers.facebook.com](https://developers.facebook.com)
2. **WhatsApp Business App** configured in the Meta dashboard
3. **Google Cloud project** with [Cloud Vision API](https://console.cloud.google.com) enabled
4. **Node.js 18+**

---

## Local Setup

```bash
# 1. Clone and install
git clone <your-repo>
cd whatsapp-bot
npm install

# 2. Create env file
cp .env.example .env
# Fill in all values in .env

# 3. Expose localhost to the internet (for webhook testing)
npx ngrok http 3000

# 4. Copy the ngrok HTTPS URL, e.g. https://abc123.ngrok.io

# 5. Start the bot
npm run dev
```

---

## Meta Webhook Configuration

1. Go to [developers.facebook.com](https://developers.facebook.com) → Your App → WhatsApp → Configuration
2. **Webhook URL:** `https://your-domain.com/webhook`
3. **Verify Token:** same string as your `VERIFY_TOKEN` env var
4. Subscribe to these fields: `messages`
5. Click **Verify and Save**

---

## Deploy to Render (Free, 24/7)

```bash
# 1. Push code to GitHub
git init && git add . && git commit -m "initial"
git remote add origin https://github.com/YOUR_USER/whatsapp-bot.git
git push -u origin main

# 2. In Render dashboard:
#    New → Web Service → connect your GitHub repo
#    Build Command:  npm install
#    Start Command:  npm start
#    Add env vars from .env (one by one in the dashboard)

# 3. Your permanent URL will be:
#    https://whatsapp-chatbot.onrender.com
```

**Important:** Free Render services spin down after 15 min of inactivity.  
Use [UptimeRobot](https://uptimerobot.com) (free) to ping `/` every 5 minutes.  
Or upgrade to the $7/mo Starter plan for always-on.

---

## Deploy to Heroku

```bash
# Install Heroku CLI first: https://devcenter.heroku.com/articles/heroku-cli

heroku create whatsapp-chatbot-yourname
heroku config:set WHATSAPP_TOKEN=xxx
heroku config:set WHATSAPP_PHONE_ID=xxx
heroku config:set VERIFY_TOKEN=xxx
heroku config:set GOOGLE_VISION_KEY=xxx
git push heroku main
heroku open
```

---

## Google Cloud Vision Setup

1. [console.cloud.google.com](https://console.cloud.google.com) → New Project
2. APIs & Services → Enable → **Cloud Vision API**
3. APIs & Services → Credentials → **Create API Key**
4. (Optional) Restrict key to Vision API only for security
5. Paste key into `GOOGLE_VISION_KEY` env var

---

## Key API References

| API | Endpoint | Docs |
|---|---|---|
| Send messages | `POST /v19.0/{phone-id}/messages` | [Link](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages) |
| Get media URL | `GET /v19.0/{media-id}` | [Link](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media) |
| Vision annotate | `POST /v1/images:annotate` | [Link](https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate) |
| Webhook setup | — | [Link](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks) |

---

## Extending This Bot

**Add more menu items:** Edit the `sections.rows` array in `whatsappService.js → sendListMenu()` and add a matching `case` in `interactiveHandler.js`.

**Add more OCR fields:** Extend the `extractKeyFields()` regex map in `ocrService.js`.

**Use Daily.co for video (private rooms):**
```js
// In meetingService.js, replace generateMeetingLink():
const res = await fetch('https://api.daily.co/v1/rooms', {
  method: 'POST',
  headers: { Authorization: `Bearer ${DAILY_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ properties: { exp: Math.floor(Date.now()/1000) + 86400 } })
});
const { url } = await res.json();
```

**Production session store (Redis):**
```bash
npm install ioredis
```
Replace the `Map` in `sessionManager.js` with Redis `get`/`set`/`del` calls.
