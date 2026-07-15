/**
 * lib/formToken.js — stateless, HMAC-signed anti-automation token.
 *
 * WHAT THIS DOES AND DOESN'T DO, HONESTLY STATED: this is not a CAPTCHA
 * and makes no attempt to distinguish a human from a sophisticated bot.
 * Its job is narrower and cheaper: it closes off the single most common
 * abuse pattern for a small public API like this one — someone opens
 * devtools, copies the POST /api/chat request shape, and loops it with
 * curl/fetch forever. That script never calls GET /api/models first (the
 * real frontend always does, to populate the model dropdown on load), so
 * it never has a token to send, and gets rejected before this app spends
 * an upstream OpenRouter call on it.
 *
 * Stateless by design — verifiable on any warm serverless instance
 * without a shared store — via HMAC-SHA256 over an issuedAt timestamp:
 * mintToken() signs `issuedAt`; verifyToken() recomputes the same
 * signature and checks both that it matches and that issuedAt falls
 * inside a short freshness window. A determined attacker can still
 * script around this (call /api/models first, same as the real
 * frontend does, then /api/chat) — that's expected. It's one layer
 * alongside rate limiting and origin checks (see lib/rateLimit.js,
 * api/chat.js), not a replacement for either. For real bot detection
 * (headless browsers, automation frameworks), see README "Security" for
 * the Vercel BotID / Attack Mode upgrade path.
 *
 * Requires FORM_TOKEN_SECRET in Vercel's environment variables. If
 * unset, minting/verification is skipped entirely (fails open) so the
 * app keeps working for anyone who hasn't configured it yet — same
 * opt-in-but-recommended convention as ALLOWED_ORIGIN in api/chat.js.
 */

'use strict';

const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 60 * 1000; // generous — a whole chat session, not a single request
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000; // tolerate issuedAt landing very slightly in the future

/**
 * @returns {{ formToken: string, formIssuedAt: number } | null} Null
 *   when FORM_TOKEN_SECRET isn't configured (feature disabled).
 */
function mintToken() {
  const secret = process.env.FORM_TOKEN_SECRET;
  if (!secret) return null;

  const formIssuedAt = Date.now();
  return { formToken: sign(formIssuedAt, secret), formIssuedAt };
}

/**
 * @param {unknown} token
 * @param {unknown} issuedAt
 * @returns {boolean} True if valid, OR if FORM_TOKEN_SECRET isn't
 *   configured (fails open — see module doc for why).
 */
function verifyToken(token, issuedAt) {
  const secret = process.env.FORM_TOKEN_SECRET;
  if (!secret) return true;

  if (typeof token !== 'string' || !token) return false;
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) return false;

  const age = Date.now() - issuedAt;
  if (age > TOKEN_TTL_MS || age < -CLOCK_SKEW_TOLERANCE_MS) return false;

  return timingSafeEqual(token, sign(issuedAt, secret));
}

/** @param {number} issuedAt @param {string} secret @returns {string} */
function sign(issuedAt, secret) {
  return crypto.createHmac('sha256', secret).update(String(issuedAt)).digest('hex');
}

/**
 * Constant-time comparison, so a failed verification's timing can't leak
 * how many leading characters of a guessed token were correct.
 * @param {string} a @param {string} b @returns {boolean}
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Different-length buffers would throw in crypto.timingSafeEqual;
  // this early return is on length only (not content), so it doesn't
  // reintroduce a content-timing side channel.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { mintToken, verifyToken };
