import OpenAI from "openai";

let client = null;

/**
 * Lazily construct a single shared OpenAI client. Returns null when no API key
 * is configured so callers can degrade gracefully instead of crashing.
 * Shared by chat completions and hosted web search (`client.responses.create`).
 * @returns {OpenAI|null}
 */
export function getOpenAI() {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) return null;
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Default chat model for the Loka assistant. */
export const CHAT_MODEL = process.env.LOKA_AI_MODEL || "gpt-4o";

/** Lighter/cheaper model used by background agents and memory summarization. */
export const UTILITY_MODEL = process.env.LOKA_AI_UTILITY_MODEL || "gpt-4o-mini";
