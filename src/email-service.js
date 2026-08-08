const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const config = require('../config');

function createMimeMessage({ to, from, subject, body }) {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    body
  ];
  const message = messageParts.join('\r\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendViaGmailApi({ to, subject, body }) {
  const { clientId, clientSecret, refreshToken, senderEmail } = config.gmail;
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail API OAuth2 credentials missing. Please check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN secrets.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const rawMessage = createMimeMessage({
    to,
    from: senderEmail || 'me',
    subject,
    body
  });

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage
    }
  });

  return response.data;
}

async function sendViaNodemailer({ to, subject, body }) {
  const { user, pass } = config.nodemailer;

  if (!user || !pass) {
    throw new Error('Nodemailer credentials missing. Please check GMAIL_USER and GMAIL_APP_PASSWORD secrets.');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: user,
      pass: pass
    }
  });

  const info = await transporter.sendMail({
    from: user,
    to: to,
    subject: subject,
    text: body
  });

  return info;
}

async function sendEmail({ to, subject, body }) {
  if (config.emailServiceType === 'nodemailer') {
    console.log(`[Email Service] Using Nodemailer transport for recipient: ${to}`);
    return await sendViaNodemailer({ to, subject, body });
  } else {
    console.log(`[Email Service] Using Gmail API (OAuth2) for recipient: ${to}`);
    return await sendViaGmailApi({ to, subject, body });
  }
}

async function sendEmailWithRetry({ to, subject, body }, maxAttempts = 2) {
  let attempt = 1;
  while (attempt <= maxAttempts) {
    try {
      console.log(`[Email Service] Sending email to "${to}" (Attempt ${attempt}/${maxAttempts})...`);
      const result = await sendEmail({ to, subject, body });
      console.log(`[Email Service] Successfully sent email to "${to}".`);
      return result;
    } catch (err) {
      console.error(`[Email Service Error] Attempt ${attempt} failed for "${to}": ${err.message}`);
      if (attempt < maxAttempts) {
        console.log(`[Email Service] Waiting 3 seconds before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        attempt++;
      } else {
        throw new Error(`Failed to send email to "${to}" after ${maxAttempts} attempts: ${err.message}`);
      }
    }
  }
}

module.exports = {
  sendEmail,
  sendEmailWithRetry
};
