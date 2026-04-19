# ⚡ Quick Start: Google Calendar Integration

## What You'll Get

✅ **Connect your personal Google Calendar** to Smart Calendar
✅ **View common free blocks** - time slots free on BOTH calendars  
✅ **Sync tasks** - push scheduled events to your Google Calendar
✅ **Live updates** - your Google Calendar events load automatically

---

## 🚀 Setup Instructions (5 minutes)

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Click **Select a Project** → **New Project**
3. Name it "Smart Calendar" → Create

### Step 2: Enable Google Calendar API
1. In Google Cloud Console, search for "Google Calendar API"
2. Click the result → **Enable**
3. Wait ~30 seconds for it to activate

### Step 3: Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials** (left sidebar)
2. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
3. **Set up OAuth consent screen first:**
   - Click "External" user type → **Create**
   - App name: "Smart Calendar"
   - Your email as admin
   - Click **Save and Continue**
   - Scopes: Skip (or add `https://www.googleapis.com/auth/calendar.events`)
   - Test users: Add your email
   - Click **Save and Continue** → **Back to Dashboard**

4. **Create the Client ID:**
   - Go back to **Credentials**
   - Click **+ Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: "Smart Calendar Web"
   - Authorized origins:
     ```
     http://localhost:3000
     http://127.0.0.1:3000
     ```
   - Click **Create**
   - **Copy the Client ID** (you'll need this!)

### Step 4: Add Client ID to Your App

In your smart-calendar project root, create a file named `.env.local`:

```
REACT_APP_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
```

Replace `YOUR_CLIENT_ID_HERE` with the Client ID you copied.

**Example:**
```
REACT_APP_GOOGLE_CLIENT_ID=123456789.apps.googleusercontent.com
```

### Step 5: Restart Your App

```bash
npm start
```

---

## 🔗 Connect Your Calendar

1. Open http://localhost:3000 in your browser
2. Go to the **📅 Calendar View** tab
3. Click **🔗 Connect Google Calendar**
4. Sign in with your Google account
5. Click **Allow** to grant permissions
6. Done! ✅

---

## 📅 Using Common Free Blocks

Once connected:

1. **View free blocks** - The **🕐 Common Free Blocks** panel shows gaps where you're free on both calendars
2. **Green blocks** = Time when:
   - Your Google Calendar is empty
   - Your Smart Calendar has no tasks scheduled
   - Block is at least 30 minutes
3. **Duration shown** - Each block displays how long it is (e.g., "2h 30m")
4. **Week view** - Switch to Week view to see daily free blocks side-by-side
5. **Hover** - Blocks show how many additional free slots are available

---

## 📤 Sync Tasks to Google Calendar

1. Go to **📅 Calendar View**
2. Click **📅 Sync all** to push all tasks, or
3. Click **☑️ Choose** to select specific tasks
4. Pick tasks by type (exams, assignments, etc.) or priority
5. Click **Sync N events** → Done! Tasks appear in your Google Calendar

---

## 🔄 Auto-Updates

- **Every 45 minutes**: Your access token refreshes silently
- **On demand**: Click the sync button to fetch latest events
- **Disconnect**: Click "Disconnect" to revoke access anytime

---

## ❌ Troubleshooting

### "Google services not loaded"
- Refresh the page
- Check `.env.local` has your Client ID
- Restart `npm start`

### "Client ID not found"
- Create `.env.local` in project root (same folder as `package.json`)
- Verify the format: `REACT_APP_GOOGLE_CLIENT_ID=xxx...`
- Restart `npm start`

### Can't see my calendar events
- Click **🔗 Connect Google Calendar** first
- Wait 5 seconds for events to load
- Check you granted permissions (you should see green ✅ Connected)

### "Session expired"
- Click **Disconnect**
- Click **🔗 Connect Google Calendar** again

---

## 🎯 What's Next?

Once your Google Calendar is connected:
- 🎤 **Voice**: Tell the AI Assistant to "Find free time tomorrow"
- 📊 **Dashboard**: See your calendar coverage
- ⚡ **Smart Scheduler**: Auto-schedule tasks in free blocks
- 📤 **Sync**: Keep your Google Calendar in sync

---

**Questions?** Check the full setup guide in `GOOGLE_CALENDAR_SETUP.md`
