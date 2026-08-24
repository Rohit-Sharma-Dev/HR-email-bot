const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const config = require('../config');

async function sendViaGmailApi({ to, subject, body, attachments = [] }) {
  const { clientId, clientSecret, refreshToken, senderEmail } = config.gmail;
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail API OAuth2 credentials missing. Please check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN secrets.');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const mailOptions = {
    from: senderEmail || 'me',
    to: to,
    subject: subject,
    text: body,
    attachments: attachments
  };

  const mail = new MailComposer(mailOptions);
  const messageBuffer = await mail.compile().build();
  const rawMessage = messageBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage
    }
  });

  return response.data;
}

async function sendViaNodemailer({ to, subject, body, attachments = [] }) {
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

  const mailOptions = {
    from: user,
    to: to,
    subject: subject,
    text: body
  };

  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  const info = await transporter.sendMail(mailOptions);
  return info;
}

async function sendEmail({ to, subject, body, attachments = [] }) {
  if (config.emailServiceType === 'nodemailer') {
    console.log(`[Email Service] Using Nodemailer transport for recipient: ${to} (Attachments: ${attachments.length})`);
    return await sendViaNodemailer({ to, subject, body, attachments });
  } else {
    console.log(`[Email Service] Using Gmail API (OAuth2) for recipient: ${to} (Attachments: ${attachments.length})`);
    return await sendViaGmailApi({ to, subject, body, attachments });
  }
}

async function sendEmailWithRetry({ to, subject, body, attachments = [] }, maxAttempts = 2) {
  let attempt = 1;
  while (attempt <= maxAttempts) {
    try {
      console.log(`[Email Service] Sending email to "${to}" (Attempt ${attempt}/${maxAttempts})...`);
      const result = await sendEmail({ to, subject, body, attachments });
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
