# Google Calendar Integration Setup

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (name it "Smart Calendar")
3. Wait for the project to be created

## Step 2: Enable Google Calendar API

1. In the Google Cloud Console, go to **APIs & Services > Library**
2. Search for "Google Calendar API"
3. Click on it and click **Enable**

## Step 3: Create OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
3. When prompted, set up the OAuth consent screen first:
   - Click **External** for User Type
   - Fill in the app name: "Smart Calendar"
   - Add your email as the developer contact
   - In Scopes, add: `https://www.googleapis.com/auth/calendar.events`
   - Add yourself as a test user
4. After the consent screen is created, go back to **Credentials**
5. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
6. Choose **Web application**
7. Add Authorized JavaScript Origins:
   - `http://localhost:3000`
   - `http://127.0.0.1:3000`
8. Add Authorized redirect URIs:
   - `http://localhost:3000`
9. Click **Create**
10. Copy the **Client ID** (you'll need this next)

## Step 4: Add Client ID to Your App

1. In the smart-calendar project root, create a `.env.local` file (or `.env` file)
2. Add this line:
   ```
   REACT_APP_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
   ```
   Replace `YOUR_CLIENT_ID_HERE` with the Client ID you copied in Step 3

3. Save the file and restart your app (`npm start`)

## Step 5: Connect Your Google Calendar

1. Open the Smart Calendar app at `http://localhost:3000`
2. Go to **🗓️ Calendar View** tab
3. Click **🔗 Connect Google Calendar**
4. Sign in with your Google account
5. Grant the app permission to access your calendar

## What Happens Next

Once connected:
- **Common Blocks**: Free time slots that appear on BOTH your Google Calendar and Smart Calendar
- **Sync**: You can push your scheduled tasks to Google Calendar
- **Live Updates**: Your calendar is checked regularly for new events

## Troubleshooting

### "Google services not loaded"
- Refresh the page and try again
- Check that `REACT_APP_GOOGLE_CLIENT_ID` is set in your `.env.local`
- Restart `npm start`

### "Session expired"
- Disconnect and reconnect your Google Calendar

### Can't see my Google Calendar events
- Make sure you've connected to Google Calendar first
- Go to **🗓️ Calendar View** and check the sync results
- Events may take a few seconds to appear
