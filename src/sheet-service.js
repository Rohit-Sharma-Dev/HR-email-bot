const { google } = require('googleapis');
const config = require('../config');

function getAuthClient() {
  if (!config.serviceAccount) {
    throw new Error('Google Service Account credentials missing. Please set GOOGLE_SERVICE_ACCOUNT_JSON secret.');
  }

  const { client_email, private_key } = config.serviceAccount;
  if (!client_email || !private_key) {
    throw new Error('Invalid service account JSON: missing client_email or private_key.');
  }

  // Format private key correctly (replace escaped \n with actual newlines)
  const formattedPrivateKey = private_key.replace(/\\n/g, '\n');

  const auth = new google.auth.JWT({
    email: client_email,
    key: formattedPrivateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return auth;
}

function getSheetsApi() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

function normalizeHeader(headerText) {
  if (!headerText) return '';
  return headerText.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapHeaderIndices(headerRow) {
  const mapping = {
    name: -1,
    company: -1,
    email: -1,
    roleCategory: -1,
    status: -1,
    responded: -1,
    dateAdded: -1,
    lastContacted: -1
  };

  headerRow.forEach((col, index) => {
    const norm = normalizeHeader(col);
    if (norm.includes('hrname') || (norm.includes('name') && !norm.includes('company'))) {
      mapping.name = index;
    } else if (norm.includes('company')) {
      mapping.company = index;
    } else if (norm.includes('email')) {
      mapping.email = index;
    } else if (norm.includes('role') || norm.includes('category')) {
      mapping.roleCategory = index;
    } else if (norm.includes('status')) {
      mapping.status = index;
    } else if (norm.includes('responded')) {
      mapping.responded = index;
    } else if (norm.includes('dateadded') || norm.includes('added')) {
      mapping.dateAdded = index;
    } else if (norm.includes('lastcontacted') || norm.includes('contacted')) {
      mapping.lastContacted = index;
    }
  });

  return mapping;
}

async function getContacts() {
  const sheets = getSheetsApi();
  const spreadsheetId = config.sheetId;

  if (!spreadsheetId) {
    throw new Error('Google Sheet ID missing. Please check GOOGLE_SHEET_ID secret.');
  }

  // Fetch sheet metadata to find main sheet tab name if necessary
  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = metadata.data.sheets.map(s => s.properties.title);
  
  let targetTab = config.contactsTabName;
  if (!sheetNames.includes(targetTab)) {
    targetTab = sheetNames[0]; // fallback to first tab
  }

  console.log(`[Sheet Service] Fetching contacts from tab "${targetTab}"...`);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${targetTab}'!A1:Z1000`
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log('[Sheet Service] No data found in sheet.');
    return { contacts: [], headerMapping: {}, targetTab };
  }

  const headerRow = rows[0];
  const mapping = mapHeaderIndices(headerRow);

  const contacts = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-based row number in Google Sheets

    const getVal = (idx) => (idx !== -1 && row[idx] !== undefined ? String(row[idx]).trim() : '');

    const contact = {
      rowNumber,
      name: getVal(mapping.name),
      company: getVal(mapping.company),
      email: getVal(mapping.email),
      roleCategory: getVal(mapping.roleCategory),
      status: getVal(mapping.status),
      responded: getVal(mapping.responded),
      dateAdded: getVal(mapping.dateAdded),
      lastContacted: getVal(mapping.lastContacted)
    };

    // Include row if email is present
    if (contact.email) {
      contacts.push(contact);
    }
  }

  return { contacts, headerMapping: mapping, targetTab };
}

function getColumnLetter(colIndex) {
  let temp;
  let letter = '';
  let idx = colIndex + 1;
  while (idx > 0) {
    temp = (idx - 1) % 26;
    letter = String.fromCharCode(65 + temp) + letter;
    idx = (idx - temp - 1) / 26;
  }
  return letter;
}

async function updateContactStatus(targetTab, rowNumber, headerMapping, newStatus, lastContactedDate) {
  const sheets = getSheetsApi();
  const spreadsheetId = config.sheetId;

  const updates = [];

  if (headerMapping.status !== -1) {
    const colLetter = getColumnLetter(headerMapping.status);
    updates.push({
      range: `'${targetTab}'!${colLetter}${rowNumber}`,
      values: [[newStatus]]
    });
  }

  if (headerMapping.lastContacted !== -1 && lastContactedDate) {
    const colLetter = getColumnLetter(headerMapping.lastContacted);
    updates.push({
      range: `'${targetTab}'!${colLetter}${rowNumber}`,
      values: [[lastContactedDate]]
    });
  }

  for (const update of updates) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: update.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: update.values
      }
    });
  }

  console.log(`[Sheet Service] Updated Row ${rowNumber}: Status="${newStatus}", Last Contacted="${lastContactedDate}"`);
}

async function appendLog({ recipient, category, templateUsed, timestamp, stage }) {
  const sheets = getSheetsApi();
  const spreadsheetId = config.sheetId;
  const logsTab = config.logsTabName;

  // Check if Logs tab exists, create if missing
  try {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = metadata.data.sheets.map(s => s.properties.title);
    
    if (!sheetNames.includes(logsTab)) {
      console.log(`[Sheet Service] Logs tab "${logsTab}" not found. Creating it...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: logsTab
                }
              }
            }
          ]
        }
      });
      // Add headers to Logs tab
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${logsTab}'!A1:E1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['Recipient', 'Category', 'Template Used', 'Timestamp', 'Stage']]
        }
      });
    }
  } catch (err) {
    console.warn(`[Sheet Service Warning] Tab check for Logs failed: ${err.message}`);
  }

  // Append row to Logs
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${logsTab}'!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[recipient, category, templateUsed, new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), stage]]
    }
  });

  console.log(`[Sheet Service Log] Recorded entry in "${logsTab}": Recipient="${recipient}", Stage="${stage}"`);
}

module.exports = {
  getContacts,
  updateContactStatus,
  appendLog
};
