# EmailJS Integration Setup Guide

The Focus Circle app now supports **automated email invitations** for group members! Here's how to set it up:

## Quick Start (5 minutes)

### Step 1: Create EmailJS Account
1. Visit [emailjs.com](https://www.emailjs.com/)
2. Sign up for a **FREE** account (no credit card needed)
3. Verify your email

### Step 2: Create Email Service
1. In EmailJS dashboard, go to **"Email Services"**
2. Click **"Add Service"**
3. Select **Gmail** (easiest option)
4. Follow the steps to connect your Gmail account
5. Copy your **Service ID** (looks like: `service_xxxxx`)

### Step 3: Create Email Template
1. Go to **"Email Templates"** in dashboard
2. Click **"Create New Template"**
3. Fill in the template:

**Subject:**
```
{{from_name}} invited you to {{circle_name}} Focus Circle! 👥
```

**Template Name:** `template_invite`

**Body:**
```
Hello {{to_name}},

{{from_name}} invited you to join the "{{circle_name}}" Focus Circle!

📝 Invite Code: {{invite_code}}
Or click here: {{invite_link}}

Start collaborating on focus sessions today!

---
Smart Calendar Team
```

4. Click **"Save"**
5. Copy your **Template ID** (looks like: `template_xxxxx`)

### Step 4: Get Your Public Key
1. Go to **"Account"** → **"API Keys"**
2. Copy your **Public Key** (looks like: `key_public_xxxxx`)

### Step 5: Configure in App
1. Open: `src/utils/emailService.js`
2. Replace these lines:
```javascript
const EMAILJS_SERVICE_ID = "service_focus_circle";      // ← Replace with your Service ID
const EMAILJS_TEMPLATE_ID = "template_invite";          // ← Replace with your Template ID
const EMAILJS_PUBLIC_KEY = "your_public_key_here";      // ← Replace with your Public Key
```

3. Save the file
4. Restart the app: `npm start`

### Step 6: Test It! 🧪
1. Open the app
2. Go to **Focus Circle** section
3. Enter your email and name in the "Invite by email" field
4. Click **"📧 Send invite"**
5. Check your email (might be in spam)

## What Happens?

✅ **If EmailJS is configured:**
- Email is automatically sent to the recipient
- Toast shows: `"✅ Invitation email sent!"`

❌ **If EmailJS is not configured:**
- App falls back to manual sharing
- Shows a shareable link you can copy
- Toast shows: `"📋 Email not configured. Share the link manually."`

## Troubleshooting

### Email not received?
1. Check spam/promotions folder
2. Verify your Gmail is connected in EmailJS
3. Check EmailJS dashboard for failed sends under "Activity"

### "Public key not valid" error?
- Make sure you copied the FULL public key from EmailJS Account > API Keys
- Don't include quotes in the code

### Need to disable emails?
- Comment out the three constants at the top of `emailService.js`
- App will use manual sharing mode instead

## Manual Fallback (Always Available)

Even without EmailJS setup, you can:
1. Click **"📧 Send invite"** with an email
2. App shows an invite link automatically
3. Click **"📋 Copy link"** and share with friends
4. They can join using the link or invite code

---

**Questions?** Check the in-app help under Focus Circle settings!
