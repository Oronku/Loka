/**
 * MongoDB collection `ai_question_sets` stores grounded multiple-choice questions
 * Loka asks the user. Lifecycle mirrors ChangeSets: pending → answered / dismissed.
 */

export const QUESTION_SETS_COLLECTION = "ai_question_sets";

/**
 * @typedef {'pending'|'answered'|'dismissed'|'superseded'} QuestionSetStatus
 * @typedef {'turn'|'agent:axisInterviewer'} QuestionSetSource
 *
 * @typedef {Object} QuestionOption
 * @property {string} id
 * @property {string} label
 * @property {string} [description]
 *
 * @typedef {Object} QuestionItem
 * @property {string} id
 * @property {string} question
 * @property {string} header
 * @property {string} axisId
 * @property {string|null} [gapId]
 * @property {string|null} [field]
 * @property {boolean} [multiSelect]
 * @property {QuestionOption[]} options
 *
 * @typedef {Object} QuestionAnswer
 * @property {string} questionId
 * @property {string[]} optionIds
 * @property {string[]} [labels]
 * @property {string|null} [customText]
 *
 * @typedef {Object} QuestionSet
 * @property {string} tripId
 * @property {string} userId
 * @property {string|null} chatId
 * @property {string|null} messageId
 * @property {QuestionSetSource} source
 * @property {QuestionSetStatus} status
 * @property {QuestionItem[]} questions
 * @property {QuestionAnswer[]|null} answers
 * @property {Date} askedAt
 * @property {Date|null} answeredAt
 * @property {Date|null} expiresAt
 */

/**
 * @param {Object} params
 * @param {string} params.tripId
 * @param {string} params.userId
 * @param {string|null} [params.chatId]
 * @param {string|null} [params.messageId]
 * @param {QuestionSetSource} [params.source]
 * @param {QuestionItem[]} params.questions
 * @param {Date} [params.expiresAt]
 */
export function buildQuestionSetDocument({
  tripId,
  userId,
  chatId = null,
  messageId = null,
  source = "turn",
  questions = [],
  expiresAt = null,
}) {
  const now = new Date();
  return {
    tripId,
    userId,
    chatId,
    messageId,
    source,
    status: "pending",
    questions,
    answers: null,
    askedAt: now,
    answeredAt: null,
    expiresAt,
  };
}
