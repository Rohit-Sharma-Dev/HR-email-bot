# HR Cold Email Bot 🚀

An automated, 100% **FREE** Node.js cold outreach application designed for job seekers. It manages multi-stage HR cold emailing and follow-up sequences using **Google Sheets** (editable directly from your phone) as the data store and **Gmail API (OAuth2)** or **Nodemailer** for email sending.

---

## 🌟 Key Features

- **Mobile First Data Management**: Add HR contacts or update responses anytime from the official **Google Sheets mobile app**.
- **100% Free & Zero Hosting Cost**: Runs on **GitHub Actions** cron schedules twice daily (9:00 AM & 2:30 PM IST).
- **Automated Multi-Stage Follow-up Sequence**:
  - **Stage 1 (Initial)**: Sends personalized email based on Role Category (`Frontend`, `Backend`, or `Fullstack`).
  - **Stage 2 (Follow-Up 1)**: Sends a short, distinct follow-up 3+ days after initial outreach.
  - **Stage 3 (Follow-Up 2)**: Sends one final nudge 7+ days after Follow-Up 1.
- **Strict Responded Check**: Before *every* individual send, checks `Responded = "No"`. If set to `Yes`, immediately halts further outreach.
- **Daily Rate Limiting & Natural Delays**: Enforces a 15-email limit per run with random 30-90 second delays between sends to protect your Gmail sender reputation.
- **Automatic Retry & Bounce Handling**: Retries failed sends once; if persistent, updates status to `bounced` and logs details in a dedicated `Logs` tab.

---

## 📁 Project Structure

```
├── .github/
│   └── workflows/
│       └── send-emails.yml     # Twice-daily cron workflow (2 PM & 5 PM IST)
├── config/
│   └── index.js                # Environment variable & secret loader
├── templates/
│   ├── frontend-initial.txt    # Frontend role initial outreach template
│   ├── backend-initial.txt     # Backend role initial outreach template
│   ├── fullstack-initial.txt   # Fullstack role initial outreach template
│   ├── followup1.txt           # First follow-up template (3+ days)
│   └── followup2.txt           # Final nudge template (7+ days)
├── src/
│   ├── email-service.js        # Supports Gmail API (OAuth2) & Nodemailer
│   ├── scheduler.js            # Core sequence state engine & 15-email cap
│   ├── sheet-service.js        # Google Sheets read/update & logging service
│   └── template-engine.js      # Placeholder replacement & opt-out footer
├── .env.example                # Local environment variable template
├── package.json
└── README.md
```

---

## 📋 Step-by-Step Setup Guide

### 1. Create & Set Up Your Google Sheet

1. Open [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet named **"HR Outreach Bot"**.
2. Set up the **first tab** (Name it `Contacts`) with the exact header row in Row 1:

| HR Name | Company | Email | Role Category | Status | Responded | Date Added | Last Contacted |
|---|---|---|---|---|---|---|---|

- **Role Category**: `Frontend`, `Backend`, or `Fullstack`
- **Status**: `pending` (Default for new contacts)
- **Responded**: `No` (Set to `Yes` manually from phone when an HR replies)
- **Date Added**: `YYYY-MM-DD`
- **Last Contacted**: Leave empty initially; the bot updates this automatically.

3. *(Optional)* Add a second tab named `Logs`. If you don't create it, the bot will create it automatically on its first run with columns: `Recipient | Category | Template Used | Timestamp | Stage`.
4. Copy your **Google Sheet ID** from the browser URL:
   `https://docs.google.com/spreadsheets/d/`**`YOUR_SHEET_ID_HERE`**`/edit`

---

### 2. Create a Google Cloud Service Account (Free)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `HR-Email-Bot`).
3. In the search bar, search for **Google Sheets API** and click **Enable**.
4. In the left sidebar, navigate to **IAM & Admin** > **Service Accounts**.
5. Click **+ Create Service Account**, name it `sheets-bot`, and click **Create and Continue** (skip optional role assignments).
6. Click on the newly created service account email (e.g. `sheets-bot@hr-email-bot.iam.gserviceaccount.com`).
7. Go to the **Keys** tab > **Add Key** > **Create new key** > Select **JSON** > Click **Create**.
8. A JSON file will download to your computer.
9. **SHARE YOUR GOOGLE SHEET**:
   - Open your Google Sheet.
   - Click the blue **Share** button at the top right.
   - Paste the service account email (`sheets-bot@hr-email-bot.iam.gserviceaccount.com`).
   - Give it **Editor** permissions and click **Send**.

---

### 3. Configure Email Credentials (Gmail API or Nodemailer)

You can choose either Option A (Gmail API OAuth2 - Recommended) or Option B (Nodemailer with Gmail App Password).

#### Option A: Gmail API OAuth2 (Recommended - Default)
1. In Google Cloud Console, enable the **Gmail API**.
2. Go to **APIs & Services** > **OAuth consent screen**:
   - Choose **External** > Fill in app name & email > Save.
   - Under **Scopes**, add `https://mail.google.com/` or `https://www.googleapis.com/auth/gmail.send`.
   - Under **Test Users**, add your personal Gmail address.
3. Go to **APIs & Services** > **Credentials** > **+ Create Credentials** > **OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs: `https://developers.google.com/oauthplayground`
4. Copy the **Client ID** and **Client Secret**.
5. Generate a **Refresh Token**:
   - Open [Google OAuth Playground](https://developers.google.com/oauthplayground).
   - Click the gear icon (top right) > Check **Use your own OAuth credentials** > Paste Client ID & Client Secret.
   - In the scope list, scroll to **Gmail API v1** > Select `https://mail.google.com/` (or `https://www.googleapis.com/auth/gmail.send`).
   - Click **Authorize APIs** and log in with your Gmail account.
   - Click **Exchange authorization code for tokens**.
   - Copy the generated **Refresh Token**.

#### Option B: Nodemailer with Gmail App Password (Alternative Fallback)
1. Go to your [Google Account Security Settings](https://myaccount.google.com/security).
2. Ensure **2-Step Verification** is turned ON.
3. Search for **App passwords** in the search bar.
4. Create a new App Password (name it `Cold Email Bot`).
5. Copy the 16-character generated password.

---

### 4. Add Repository Secrets to GitHub

1. Push this repository to GitHub.
2. Go to your GitHub Repository > **Settings** > **Secrets and variables** > **Actions**.
3. Click **New repository secret** for each of the following:

#### Required Secrets:
| Secret Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Contents of the downloaded GCP service account JSON file (or Base64 string of it) |
| `GOOGLE_SHEET_ID` | Your Google Sheet ID copied from Step 1 |

#### Secrets for Gmail API (Default):
| Secret Name | Value |
|---|---|
| `EMAIL_SERVICE_TYPE` | `gmail_api` |
| `GMAIL_CLIENT_ID` | OAuth2 Client ID from Step 3A |
| `GMAIL_CLIENT_SECRET` | OAuth2 Client Secret from Step 3A |
| `GMAIL_REFRESH_TOKEN` | OAuth2 Refresh Token from Step 3A |
| `SENDER_EMAIL` | Your Gmail address (e.g. `yourname@gmail.com`) |

#### Secrets for Nodemailer Fallback (Alternative):
| Secret Name | Value |
|---|---|
| `EMAIL_SERVICE_TYPE` | `nodemailer` |
| `GMAIL_USER` | Your Gmail address (e.g. `yourname@gmail.com`) |
| `GMAIL_APP_PASSWORD` | 16-character App Password from Step 3B |

---

## 🛠️ Local Testing Instructions

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the project root based on `.env.example`:
   ```env
   GOOGLE_SHEET_ID=your_sheet_id_here
   GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...}
   EMAIL_SERVICE_TYPE=gmail_api
   GMAIL_CLIENT_ID=your_client_id
   GMAIL_CLIENT_SECRET=your_client_secret
   GMAIL_REFRESH_TOKEN=your_refresh_token
   SENDER_EMAIL=yourname@gmail.com
   ```

3. Run a **Dry Run** (Simulates candidates without sending emails or modifying sheet):
   ```bash
   npm test
   ```

4. Run the live bot locally:
   ```bash
   npm start
   ```

---

## ⚙️ How the Automated Schedule Works

- GitHub Actions automatically triggers the bot twice a day at **9:00 AM IST (03:30 UTC)** and **2:30 PM IST (09:00 UTC)**.
- You can also manually trigger a run anytime by going to **GitHub Actions** tab > **HR Cold Email Bot - Twice Daily Scheduler** > Click **Run workflow**.

---

## 📄 Opt-Out & Compliance

Every email includes a standard opt-out footer:
> *If you prefer not to receive future emails, simply reply with 'unsubscribe' and I will remove you right away.*

When an HR replies or unsubscribes, open the Google Sheets app on your phone and change `Responded` to `Yes`. The bot will immediately skip all future emails to that contact.
#   H R - e m a i l - b o t  
 