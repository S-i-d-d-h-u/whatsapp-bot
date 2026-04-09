// config/constants.js
// ─── All environment variables in one place ────────────────────────────────

export const CONFIG = {
  // Meta / WhatsApp Business API
  WHATSAPP_TOKEN:       process.env.WHATSAPP_TOKEN,       // Your permanent access token
  WHATSAPP_PHONE_ID:    process.env.WHATSAPP_PHONE_ID,    // Phone Number ID from Meta dashboard
  VERIFY_TOKEN:         process.env.VERIFY_TOKEN,         // Any string you choose for webhook verification

  // Google Cloud Vision
  GOOGLE_VISION_KEY:    process.env.GOOGLE_VISION_KEY,    // Google Cloud API Key with Vision API enabled

  // Video Call (Jitsi = free & no auth needed; swap with Daily/Zoom if preferred)
  JITSI_BASE_URL:       process.env.JITSI_BASE_URL || 'https://meet.jit.si',

  // API Endpoints
  WA_API_BASE: `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
  VISION_API_BASE: 'https://vision.googleapis.com/v1/images:annotate',
};

// ─── Menu IDs ─────────────────────────────────────────────────────────────────
export const MENU = {
  // List Message row IDs
  LIST_SCAN_DOC:   'scan_document',
  LIST_VIDEO_CALL: 'video_call',
  LIST_HELP:       'help',
  LIST_ABOUT:      'about',

  // Reply Button IDs
  BTN_YES:    'btn_yes',
  BTN_NO:     'btn_no',
  BTN_MAIN:   'btn_main_menu',
};
