const fs = require('fs');
const path = require('path');
const config = require('../config');
const sheetService = require('./sheet-service');
const emailService = require('./email-service');
const templateEngine = require('./template-engine');

const isDryRun = process.argv.includes('--dry-run');

function getTodayIST() {
  const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options);
  return formatter.format(new Date());
}

function getDaysDifference(lastContactedStr, todayStr) {
  if (!lastContactedStr) return 999;
  const d1 = new Date(lastContactedStr);
  const d2 = new Date(todayStr);
  if (isNaN(d1.getTime())) return 999;
  const diffTime = d2.getTime() - d1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getRandomDelay(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isResponded(contact) {
  const val = (contact.responded || '').trim().toLowerCase();
  return val === 'yes' || val === 'true' || val === '1';
}

async function runScheduler() {
  console.log('====================================================');
  console.log(`[HR Cold Email Bot] Starting run at ${new Date().toISOString()}`);
  if (isDryRun) {
    console.log('*** DRY RUN MODE ENABLED - No emails will be sent and no sheet updates will be performed. ***');
  }
  console.log('====================================================');

  const todayStr = getTodayIST();
  console.log(`[Scheduler] Today's date (IST): ${todayStr}`);

  // Fetch contacts from Google Sheets
  const { contacts, headerMapping, targetTab } = await sheetService.getContacts();
  console.log(`[Scheduler] Loaded ${contacts.length} total contacts from sheet tab "${targetTab}".`);

  if (contacts.length === 0) {
    console.log('[Scheduler] No contacts found. Exiting.');
    return;
  }

  // Filter candidates per stage
  const initialCandidates = [];
  const followup1Candidates = [];
  const followup2Candidates = [];

  for (const contact of contacts) {
    // CORE RULE: If Responded is Yes (or not No), skip row completely!
    if (isResponded(contact)) {
      console.log(`[Skip] Row ${contact.rowNumber} (${contact.email}): Responded = "${contact.responded}". Skipping.`);
      continue;
    }

    const status = (contact.status || 'pending').toLowerCase();
    const daysSinceLastContact = getDaysDifference(contact.lastContacted, todayStr);

    if (status === 'pending' || status === '') {
      initialCandidates.push({ contact, stage: 'initial' });
    } else if (status === 'sent' && daysSinceLastContact >= config.followup1Days) {
      followup1Candidates.push({ contact, stage: 'followup1', daysSinceLastContact });
    } else if (status === 'followup1_sent' && daysSinceLastContact >= config.followup2Days) {
      followup2Candidates.push({ contact, stage: 'followup2', daysSinceLastContact });
    } else {
      console.log(`[Skip] Row ${contact.rowNumber} (${contact.email}): Status="${contact.status}", LastContacted="${contact.lastContacted}" (${daysSinceLastContact} days ago). Not eligible.`);
    }
  }

  // Sequence: INITIAL -> FOLLOW-UP 1 -> FOLLOW-UP 2
  const sendQueue = [
    ...initialCandidates,
    ...followup1Candidates,
    ...followup2Candidates
  ];

  console.log(`\n[Scheduler Queue Summary]`);
  console.log(`- Stage 1 (Initial): ${initialCandidates.length} eligible`);
  console.log(`- Stage 2 (Follow-up 1): ${followup1Candidates.length} eligible`);
  console.log(`- Stage 3 (Follow-up 2): ${followup2Candidates.length} eligible`);
  console.log(`- Total Queue Size: ${sendQueue.length} contacts`);

  const maxCap = config.maxEmailsPerRun;
  const toProcess = sendQueue.slice(0, maxCap);
  console.log(`[Scheduler] Will process up to ${toProcess.length} emails in this run (Cap: ${maxCap}).\n`);

  let sentCount = 0;
  let bounceCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const { contact, stage } = toProcess[i];
    console.log(`\n----------------------------------------------------`);
    console.log(`[Item ${i + 1}/${toProcess.length}] Processing Row ${contact.rowNumber}: ${contact.name} (${contact.email})`);
    console.log(`Company: "${contact.company}", Role Category: "${contact.roleCategory}", Stage: "${stage}"`);

    // Double-check Responded status before send
    if (isResponded(contact)) {
      console.log(`[Safety Check] Contact marked as Responded="Yes" right before send. Skipping.`);
      continue;
    }

    try {
      const emailContent = templateEngine.renderTemplate(stage, contact.roleCategory, {
        name: contact.name,
        company: contact.company,
        role: contact.roleCategory
      });

      console.log(`[Template Engine] Using template: "${emailContent.templateName}"`);
      console.log(`[Subject]: ${emailContent.subject}`);

      const attachments = [];
      if (emailContent.attachmentPath && fs.existsSync(emailContent.attachmentPath)) {
        attachments.push({
          filename: path.basename(emailContent.attachmentPath),
          path: emailContent.attachmentPath
        });
        console.log(`[Scheduler Attachment] Attaching resume: "${path.basename(emailContent.attachmentPath)}"`);
      } else {
        console.log(`[Scheduler Attachment] No resume file found for role category "${contact.roleCategory}".`);
      }

      if (isDryRun) {
        console.log(`[DRY RUN] Would send email to ${contact.email} with ${attachments.length} attachment(s).`);
        console.log(`[DRY RUN] Body Snippet: ${emailContent.body.substring(0, 120)}...`);
      } else {
        // Send email with automatic single retry
        await emailService.sendEmailWithRetry({
          to: contact.email,
          subject: emailContent.subject,
          body: emailContent.body,
          attachments: attachments
        });

        // Determine next status
        let newStatus = 'sent';
        if (stage === 'followup1') newStatus = 'followup1_sent';
        if (stage === 'followup2') newStatus = 'followup2_sent';

        // Update main Google Sheet
        await sheetService.updateContactStatus(targetTab, contact.rowNumber, headerMapping, newStatus, todayStr);

        // Append log to Logs tab
        await sheetService.appendLog({
          recipient: contact.email,
          category: contact.roleCategory || 'N/A',
          templateUsed: emailContent.templateName,
          timestamp: new Date().toISOString(),
          stage: stage
        });

        sentCount++;
      }
    } catch (err) {
      console.error(`[Scheduler Error] Permanent failure sending to Row ${contact.rowNumber} (${contact.email}): ${err.message}`);
      
      if (!isDryRun) {
        console.log(`[Scheduler] Marking Row ${contact.rowNumber} status as "bounced"...`);
        try {
          await sheetService.updateContactStatus(targetTab, contact.rowNumber, headerMapping, 'bounced', todayStr);
          await sheetService.appendLog({
            recipient: contact.email,
            category: contact.roleCategory || 'N/A',
            templateUsed: 'N/A',
            timestamp: new Date().toISOString(),
            stage: `${stage}_failed_bounced`
          });
          bounceCount++;
        } catch (updateErr) {
          console.error(`[Scheduler Error] Failed to update bounce status in sheet: ${updateErr.message}`);
        }
      }
    }

    // Delay between sends (random 30-90s)
    if (i < toProcess.length - 1 && !isDryRun) {
      const delayMs = getRandomDelay(config.minDelayMs, config.maxDelayMs);
      console.log(`[Delay] Waiting ${(delayMs / 1000).toFixed(1)} seconds before next send...`);
      await sleep(delayMs);
    }
  }

  console.log('\n====================================================');
  console.log(`[HR Cold Email Bot] Run Completed.`);
  console.log(`- Total Emails Sent: ${sentCount}`);
  console.log(`- Total Bounces Encountered: ${bounceCount}`);
  console.log('====================================================');
}

runScheduler().catch((err) => {
  console.error('[Fatal Scheduler Exception]', err);
  process.exit(1);
});
