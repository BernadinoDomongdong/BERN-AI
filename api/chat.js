/**
 * api/chat.js — Vercel serverless function.
 *
 * Runs on Vercel's servers, never in the visitor's browser. The
 * OpenRouter API key lives only in Vercel's Environment Variables (see
 * README), so it's never present in any file that gets committed to
 * GitHub or shipped to the client.
 */

'use strict';

const { fetchFreeModels } = require('../lib/freeModels');
const { checkRateLimit, clientKeyFromRequest, ensureSweepScheduled } = require('../lib/rateLimit');

/**
 * @typedef {Object} ChatRequestBody
 * @property {string} message - The user's question.
 * @property {string} [model] - Requested OpenRouter model id.
 * @property {string} [language] - Desired reply language, human-readable.
 */

const DEFAULT_LANGUAGE = 'English';
const MAX_LANGUAGE_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 4000; // generous for a chat question, cheap to enforce, caps abuse/cost
const UPSTREAM_TIMEOUT_MS = 30 * 1000;
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const APP_REFERER = 'https://www.bernarddev.com';
const APP_TITLE = 'BERN-AI';

// This endpoint costs real upstream calls (and, indirectly, OpenRouter's
// free-tier goodwill) per request, so it gets the stricter of the two
// API rate limits. See lib/rateLimit.js for the scope/limits of this
// protection — it's a real deterrent, not a DDoS-proof guarantee.
const RATE_LIMIT = { windowMs: 60 * 1000, max: 8 };

// Set ALLOWED_ORIGIN in Vercel's environment variables (e.g.
// "https://bern-ai.site") to reject cross-site requests to this
// endpoint. Left unset, this check is skipped — fine for local dev, but
// setting it in production closes off one avenue for other sites to
// piggyback on your OpenRouter quota via a browser-based request.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

/** Raised for any failure that should be reported back to the client
 *  with a specific HTTP status, so the handler's catch block doesn't
 *  need to guess an appropriate status code from a generic Error. */
class RequestError extends Error {
  /**
   * @param {string} message
   * @param {number} status - HTTP status to respond with.
   */
  constructor(message, status) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

/**
 * Validates and normalizes the incoming request body.
 * @param {unknown} body
 * @returns {{ message: string, model: string|undefined, language: string|undefined }}
 * @throws {RequestError} If required fields are missing or malformed.
 */
function parseRequestBody(body) {
  const { message, model, language } = body || {};

  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new RequestError('Missing "message" in request body', 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new RequestError(`"message" is too long (max ${MAX_MESSAGE_LENGTH} characters)`, 400);
  }
  if (model !== undefined && typeof model !== 'string') {
    throw new RequestError('"model" must be a string if provided', 400);
  }
  if (language !== undefined && typeof language !== 'string') {
    throw new RequestError('"language" must be a string if provided', 400);
  }

  return { message, model, language };
}

/**
 * The frontend lets the person pick which language the answer should be
 * in (English by default). We never trust that string blindly, since
 * it flows straight into a system prompt: strip newlines/control
 * characters and cap the length so it can't be used to smuggle extra
 * instructions in.
 * @param {string|undefined} rawLanguage
 * @returns {string}
 */
function sanitizeLanguage(rawLanguage) {
  if (typeof rawLanguage !== 'string') return DEFAULT_LANGUAGE;

  const cleaned = rawLanguage
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s().,/-]/gu, '')
    .trim()
    .slice(0, MAX_LANGUAGE_LENGTH);

  return cleaned || DEFAULT_LANGUAGE;
}

/**
 * Builds the system prompt that forces the reply into the chosen language.
 * @param {string} language - Already sanitized via sanitizeLanguage().
 * @returns {string}
 */
function buildSystemPrompt(language) {
  return (
    'You are BERN-AI, a helpful AI assistant for Cebuano users. ' +
    `Always answer in ${language}, regardless of what language the ` +
    'question is written in, unless the user explicitly asks you to ' +
    'switch languages in their message. Keep the tone natural and ' +
    'conversational. If a technical term has no natural translation, ' +
    `you may keep the original term but still explain it in ${language}.`
  );
}

/**
 * Re-checks the requested model against the live free-model list. Never
 * trusts the model string from the browser as-is, so a request can never
 * accidentally (or deliberately) reach a paid model and rack up charges.
 * @param {string|undefined} requestedModelId
 * @returns {Promise<string>} The model id to actually send upstream.
 * @throws {RequestError} If no free models are currently available.
 */
async function resolveFreeModel(requestedModelId) {
  const freeModels = await fetchFreeModels();

  if (freeModels.length === 0) {
    throw new RequestError('No free models are currently available on OpenRouter. Try again later.', 503);
  }

  const isRequestedModelFree = freeModels.some((m) => m.id === requestedModelId);
  return isRequestedModelFree ? requestedModelId : freeModels[0].id;
}

/**
 * Forwards the chat request to OpenRouter and returns its parsed response.
 * @param {{ apiKey: string, model: string, systemPrompt: string, message: string }} params
 * @returns {Promise<unknown>} OpenRouter's response body.
 * @throws {RequestError}
 */
async function forwardToOpenRouter({ apiKey, model, systemPrompt, message }) {
  let response;
  try {
    response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': APP_REFERER,
        'X-Title': APP_TITLE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    throw new RequestError(
      isTimeout ? 'OpenRouter did not respond in time' : `Could not reach OpenRouter: ${err.message}`,
      isTimeout ? 504 : 502
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new RequestError(data.error?.message || 'OpenRouter request failed', response.status);
  }

  return data;
}

/**
 * Rejects cross-site requests when ALLOWED_ORIGIN is configured. Requests
 * with no Origin header (same-origin navigations in some browsers, or
 * non-browser tools like curl) are allowed through, since that header
 * can't be relied on to always be present for legitimate same-origin
 * calls — this check narrows the attack surface without being a complete
 * CSRF solution on its own.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function isOriginAllowed(req) {
  if (!ALLOWED_ORIGIN) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === ALLOWED_ORIGIN;
}

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isOriginAllowed(req)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  ensureSweepScheduled(RATE_LIMIT.windowMs);
  const clientKey = clientKeyFromRequest(req);
  const rate = checkRateLimit(clientKey, RATE_LIMIT);
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT.max));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' });
    return;
  }

  try {
    const { message, model, language } = parseRequestBody(req.body);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new RequestError(
        'Server is missing OPENROUTER_API_KEY. Set it in Vercel > Project Settings > Environment Variables.',
        500
      );
    }

    const resolvedModel = await resolveFreeModel(model);
    const systemPrompt = buildSystemPrompt(sanitizeLanguage(language));

    const data = await forwardToOpenRouter({ apiKey, model: resolvedModel, systemPrompt, message });
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof RequestError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // Unexpected/unclassified failure — log server-side for diagnosis,
    // but don't leak internals to the client.
    console.error('Unexpected error in /api/chat:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
};
