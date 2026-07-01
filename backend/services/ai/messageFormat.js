/**
 * Compact text for message attachments. Place cards use [Shared place: …]; other
 * types get a generic tag so future attachment kinds can extend this switch.
 */
export function formatMessageAttachments(attachments) {
  if (!attachments?.length) return "";
  return attachments
    .map((a) => {
      switch (a.type) {
        case "place": {
          const rating = a.rating != null ? ` (${a.rating}★)` : "";
          const category = a.category ? `, ${a.category}` : "";
          return `[Shared place: ${a.name || "Place"}${rating}${category}]`;
        }
        default:
          return `[Attachment: ${a.type || "file"}${a.name ? ` ${a.name}` : ""}]`;
      }
    })
    .join(" ");
}

/** Human-readable line for classifier / LLM context (includes sender for humans). */
export function messageToContextLine(message) {
  const attachText = formatMessageAttachments(message.attachments);
  const text = (message.text || "").trim();
  const body = [text, attachText].filter(Boolean).join(" ");
  if (!body) return null;
  if (message.senderId === "loka-bot") return `Loka: ${body}`;
  const name = message.senderName || "User";
  return `${name}: ${body}`;
}

/**
 * Group chat history for the assistant API. Human senders are labeled on user
 * turns; Loka's prior lines are plain text (role is already "assistant").
 */
export function messageToGroupHistoryLine(message) {
  const attachText = formatMessageAttachments(message.attachments);
  const text = (message.text || "").trim();
  const body = [text, attachText].filter(Boolean).join(" ");
  if (!body) return null;
  if (message.senderId === "loka-bot") {
    return sanitizeLokaReplyText(body);
  }
  const name = message.senderName || "User";
  return `${name}: ${body}`;
}

/** Strip model echo of "Loka:" — the UI already shows her name on the bubble. */
export function sanitizeLokaReplyText(text) {
  return (text || "").replace(/^Loka:\s*/i, "").trim();
}

/** Chronological OpenAI history with sender labels for group chats. */
export function messagesToHistory(messages) {
  return messages
    .map((m) => {
      const content = messageToGroupHistoryLine(m);
      if (!content) return null;
      return {
        role: m.senderId === "loka-bot" ? "assistant" : "user",
        content,
      };
    })
    .filter(Boolean);
}
