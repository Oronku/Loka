/**
 * Chat-turn guard so Loka cannot claim a trip write without a reviewable card.
 *
 * Tools never mutate the trip; only Apply does. If the model talks like the
 * change already landed — or dedup drops the new ChangeSet — rewrite / reuse
 * so the user either sees the card or hears the truth.
 */

import { ObjectId } from "mongodb";
import { createChangeSet, getChangeSet, PROPOSALS_COLLECTION } from "./changeset.js";
import { findSkipReason } from "./proposalDedup.js";

const HEBREW_RE = /[\u0590-\u05FF]/;

/**
 * Past-tense "I already wrote to your trip" claims. Conservative: only first-person
 * completed writes, not "I can add" / "I'll propose".
 */
const COMPLETED_WRITE_RE =
  /(?:I(?:'ve| have)?\s+(?:just\s+)?(?:set(?:ting)?(?:\s+\S+){0,3}\s+up|scheduled|booked|added|reserved|updated|moved|created|put)\b|\b(?:all set|it's done|it's all set)\b|סידרתי|קבעתי|הוספתי|הזמנתי|עדכנתי|שמתי)/i;

export function claimsCompletedWrite(text) {
  return COMPLETED_WRITE_RE.test(String(text || ""));
}

export function looksHebrew(text) {
  return HEBREW_RE.test(String(text || ""));
}

export function honestNoProposalText(text) {
  if (looksHebrew(text)) {
    return "עוד לא נגעתי בטיול — כלום לא נכנס בלי כרטיס לאישור. מה לשים עליו?";
  }
  return "I haven't touched your trip — nothing lands until you approve a card. What should I put on it?";
}

export function honestSkippedProposalText(text, skip) {
  const reason = skip?.reason;
  if (looksHebrew(text)) {
    if (reason === "already_on_item" || reason === "already_applied") {
      return "זה כבר בטיול — לא שיניתי כלום.";
    }
    return "ההצעה כבר ממתינה לאישור שלך. לא יצרתי כרטיס חדש.";
  }
  if (reason === "already_on_item" || reason === "already_applied") {
    return "That's already on your trip — I didn't change anything.";
  }
  return "That change is already waiting for you to approve. I didn't create a new card.";
}

export function shouldReusePending(skip) {
  return skip?.reason === "pending_same_item" && Boolean(skip.existingId);
}

async function loadExistingProposal(db, id) {
  if (id == null || !db) return null;
  const asString = String(id);
  const fromCanonical = ObjectId.isValid(asString) ? await getChangeSet(db, asString) : null;
  if (fromCanonical) return fromCanonical;

  const col = db.collection(PROPOSALS_COLLECTION);
  const doc =
    (await col.findOne({ _id: asString })) ||
    (typeof id === "object" ? await col.findOne({ _id: id }) : null);
  if (!doc) return null;
  return { ...doc, _id: doc._id.toString() };
}

/**
 * Persist (or reuse) the ChangeSet for a chat turn and rewrite false "I did it"
 * copy when no card will be shown.
 *
 * @returns {Promise<{ changeSet: object|null, text: string }>}
 */
export async function settleChatProposal(db, { result, chatId = null, userId }) {
  const rawText = result?.text || "";
  const operations = result?.operations || [];

  if (operations.length === 0) {
    return {
      changeSet: null,
      text: claimsCompletedWrite(rawText) ? honestNoProposalText(rawText) : rawText,
    };
  }

  const created = await createChangeSet(db, {
    tripId: result.createsTrip ? null : result.targetTripId,
    tripName: result.tripName,
    createsTrip: result.createsTrip,
    chatId,
    userId,
    source: "chat",
    rationale: result.rationale,
    operations,
  });
  if (created) {
    return { changeSet: created, text: rawText };
  }

  const skip = await findSkipReason(db, {
    userId,
    tripId: result.createsTrip ? null : result.targetTripId,
    operations,
    source: "chat",
  });

  if (shouldReusePending(skip)) {
    const existing = await loadExistingProposal(db, skip.existingId);
    if (existing) {
      console.log(
        `[replyGuard] reuse pending ChangeSet ${existing._id} trip=${existing.tripId || "none"}`,
      );
      return { changeSet: existing, text: rawText };
    }
  }

  console.log(
    `[replyGuard] drop ChangeSet reason=${skip?.reason || "unknown"} trip=${result.targetTripId || "none"}`,
  );
  return {
    changeSet: null,
    text: honestSkippedProposalText(rawText, skip),
  };
}
