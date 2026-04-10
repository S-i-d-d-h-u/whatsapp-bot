// src/utils/verifyWebhook.js  — Meta webhook handshake
export function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verified ✅');
    return res.status(200).send(challenge);
  }

  console.error('Webhook verification failed ❌');
  return res.sendStatus(403);
}
