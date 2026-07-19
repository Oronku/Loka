import { BrevoClient } from "@getbrevo/brevo";

let client = null;

function getBrevoClient() {
  if (!client) {
    const apiKey =
      process.env.BREVO_API_KEY || process.env.BRAVO_SMTP_API_KEY;
    if (!apiKey) {
      throw new Error("BREVO_API_KEY is not configured");
    }
    client = new BrevoClient({ apiKey });
  }
  return client;
}

const isDev = process.env.NODE_ENV !== "production";

export async function sendOtpEmail(email, code) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Loka";
  const hasApiKey =
    process.env.BREVO_API_KEY || process.env.BRAVO_SMTP_API_KEY;

  if (hasApiKey && senderEmail) {
    try {
      await sendViaBrevo(email, code, senderEmail, senderName);
      if (isDev) {
        console.log(`[dev] OTP email sent to ${email} (code: ${code})`);
      }
      return;
    } catch (error) {
      console.error("Failed to send OTP email:", error);
      if (!isDev) {
        throw error;
      }
      console.warn(
        `[dev] Brevo failed — use this OTP for ${email}: ${code}`
      );
      return;
    }
  }

  if (isDev) {
    console.warn(`[dev] Brevo not configured — OTP for ${email}: ${code}`);
    return;
  }

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL is not configured");
  }
  throw new Error("BREVO_API_KEY is not configured");
}

async function sendViaBrevo(email, code, senderEmail, senderName) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Loka</h2>
      <p style="color: #444; font-size: 16px;">Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1a1a2e; margin: 16px 0;">${code}</p>
      <p style="color: #666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const brevo = getBrevoClient();
  await brevo.transactionalEmails.sendTransacEmail({
    subject: "Your Loka verification code",
    htmlContent,
    sender: { name: senderName, email: senderEmail },
    to: [{ email }],
  });
}
