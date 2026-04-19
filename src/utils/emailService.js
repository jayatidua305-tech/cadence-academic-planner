import emailjs from '@emailjs/browser';

// Initialize EmailJS (using a public key - safe for frontend)
// You'll need to sign up at https://www.emailjs.com/ to get these IDs
const EMAILJS_SERVICE_ID = "service_uumi31v";
const EMAILJS_TEMPLATE_ID = "template_o2ofjhn";
const EMAILJS_PUBLIC_KEY = "nqM5XsSpm3lmgEJ6w";

let isInitialized = false;

export function initEmailJS() {
  if (isInitialized) return;
  try {
    console.log("🔧 Initializing EmailJS with public key:", EMAILJS_PUBLIC_KEY);
    emailjs.init(EMAILJS_PUBLIC_KEY);
    isInitialized = true;
    console.log("✅ EmailJS initialized successfully");
  } catch (err) {
    console.error("❌ EmailJS initialization failed:", err);
    console.warn("EmailJS not configured - invitations will use manual sharing mode");
  }
}

export async function sendInvitationEmail(recipientEmail, recipientName, senderName, circleName, inviteCode) {
  // If EmailJS is not properly configured, return false to trigger manual mode
  console.log("📧 sendInvitationEmail called:", { recipientEmail, recipientName, senderName, circleName, inviteCode });
  console.log("🔍 isInitialized:", isInitialized);
  
  if (!isInitialized) {
    console.warn("⚠️ EmailJS not initialized, using manual mode");
    return false;
  }

  try {
    const payload = {
      to_email: recipientEmail,
      to_name: recipientName,
      from_name: senderName,
      circle_name: circleName,
      invite_code: inviteCode,
      invite_link: `${window.location.origin}?circleCode=${inviteCode}&invitedMember=${recipientName}`,
    };
    
    console.log("📤 Sending email with payload:", payload);
    console.log("📤 Service ID:", EMAILJS_SERVICE_ID);
    console.log("📤 Template ID:", EMAILJS_TEMPLATE_ID);
    
    const result = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      payload,
      EMAILJS_PUBLIC_KEY
    );
    
    console.log("✅ Email sent successfully:", result);
    console.log("✅ Status:", result.status);
    console.log("✅ Text:", result.text);
    return result.status === 200;
  } catch (err) {
    console.error("❌ Failed to send invitation email:", err);
    console.error("❌ Error message:", err.message);
    console.error("❌ Error text:", err.text);
    console.error("❌ Full error:", JSON.stringify(err, null, 2));
    return false;
  }
}

export function getInviteLink(circleName, inviteCode) {
  return `${window.location.origin}?circleCode=${inviteCode}&circleName=${encodeURIComponent(circleName)}`;
}

export function getConfigurationGuide() {
  return `
📧 To enable email invitations:

1. Visit https://www.emailjs.com/
2. Sign up for a free account
3. Create a new Service (Gmail recommended)
4. Create an Email Template with variables: 
   - {{to_name}}, {{from_name}}, {{circle_name}}, {{invite_code}}, {{invite_link}}
5. Copy your Service ID, Template ID, and Public Key
6. Replace EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY in emailService.js

Template example:
Subject: {{from_name}} invited you to {{circle_name}} Focus Circle

Body:
Hello {{to_name}},

{{from_name}} invited you to join the "{{circle_name}}" Focus Circle!

Invite Code: {{invite_code}}
Or click: {{invite_link}}

Start collaborating on focus sessions today!

Smart Calendar Team
  `;
}
