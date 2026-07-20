import bcrypt from "bcryptjs";
import { getDatabase } from "../config/database.js";
import { sendOtpEmail } from "./email.service.js";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESEND_THROTTLE_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

function getOtpsCollection() {
  const db = getDatabase();
  return db ? db.collection("email_otps") : null;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function generateAndSendOtp(email, purpose) {
  const collection = getOtpsCollection();
  if (!collection) {
    throw new Error("Database not available");
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const now = new Date();

  await collection.updateOne(
    { email, purpose },
    {
      $set: {
        email,
        purpose,
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
        attempts: 0,
        createdAt: now,
      },
    },
    { upsert: true }
  );

  await sendOtpEmail(email, code);
}

export async function resendOtp(email, purpose) {
  const collection = getOtpsCollection();
  if (!collection) {
    throw new Error("Database not available");
  }

  const existing = await collection.findOne({ email, purpose });
  if (existing?.createdAt) {
    const elapsed = Date.now() - new Date(existing.createdAt).getTime();
    if (elapsed < RESEND_THROTTLE_MS) {
      return;
    }
  }

  await generateAndSendOtp(email, purpose);
}

export async function verifyOtp(email, code, purpose) {
  const collection = getOtpsCollection();
  if (!collection) {
    return false;
  }

  const doc = await collection.findOne({ email, purpose });
  if (!doc || new Date(doc.expiresAt) < new Date()) {
    return false;
  }

  const attempts = (doc.attempts || 0) + 1;
  await collection.updateOne({ email, purpose }, { $set: { attempts } });

  if (attempts > MAX_ATTEMPTS) {
    await collection.deleteOne({ email, purpose });
    return false;
  }

  const isMatch = await bcrypt.compare(code, doc.codeHash);
  if (isMatch) {
    await collection.deleteOne({ email, purpose });
    return true;
  }

  return false;
}
