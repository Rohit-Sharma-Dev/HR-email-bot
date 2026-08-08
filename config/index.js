const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function parseServiceAccount(jsonOrBase64) {
  if (!jsonOrBase64) return null;
  const trimmed = jsonOrBase64.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON as raw JSON: ${e.message}`);
    }
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (e) {
    throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON as Base64 JSON: ${e.message}`);
  }
}

const serviceAccount = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

module.exports = {
  sheetId: process.env.GOOGLE_SHEET_ID,
  serviceAccount: serviceAccount,
  emailServiceType: (process.env.EMAIL_SERVICE_TYPE || 'gmail_api').toLowerCase(),
  
  // Gmail API (OAuth2) Configuration
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    senderEmail: process.env.SENDER_EMAIL || process.env.GMAIL_USER,
  },

  // Nodemailer (App Password) Configuration
  nodemailer: {
    user: process.env.GMAIL_USER || process.env.SENDER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },

  // Run Constraints
  maxEmailsPerRun: parseInt(process.env.MAX_EMAILS_PER_RUN || '15', 10),
  minDelayMs: parseInt(process.env.MIN_DELAY_MS || '30000', 10), // 30 seconds
  maxDelayMs: parseInt(process.env.MAX_DELAY_MS || '90000', 10), // 90 seconds

  // Follow-up offsets (in days)
  followup1Days: 3,
  followup2Days: 7,

  // Tab Names
  contactsTabName: process.env.CONTACTS_TAB_NAME || 'Contacts',
  logsTabName: process.env.LOGS_TAB_NAME || 'Logs'
};
