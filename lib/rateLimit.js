/**
 * lib/rateLimit.js — best-effort, in-memory rate limiter.
 *
 * SCOPE, HONESTLY STATED: Vercel serverless functions are stateless and
 * can run as multiple concurrent instances across regions; this in-memory
 * store lives inside a single instance, not shared across the fleet. A
 * determined, distributed attacker can exceed these limits by fanning
 * requests across instances. This is a legitimate, useful first line of
 * defense against casual abuse, misbehaving scripts, and single-source
 * hammering — it is NOT a substitute for:
 *
 *   1. Vercel's platform-level DDoS protection, which sits at the network
 *      edge in front of every deployment and absorbs volumetric attacks
 *      no application code could ever handle on its own.
 *   2. A shared store (e.g. Upstash Redis via @upstash/ratelimit) for
 *      true cross-instance distributed rate limiting, if this app grows
 *      into a target worth hardening further. Swapping this module's
 *      internals for a Redis-backed implementation is a drop-in change —
 *      callers only depend on checkRateLimit()'s return shape.
 *   3. A CDN/WAF (Cloudflare, Vercel Firewall rules) for IP reputation
 *      and challenge-based bot mitigation.
 *
 * See README "Security" for the fuller picture and upgrade path.
 */

'use strict';

/**
 * @typedef {Object} RateLimitResult
 * @property {boolean} allowed
 * @property {number} remaining
 * @property {number} retryAfterSeconds
 */

/** @type {Map<string, { count: number, windowStart: number }>} */
const buckets = new Map();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** @type {NodeJS.Timeout|null} */
let sweepTimer = null;

/**
 * Checks and records one request against a sliding window for `key`.
 * @param {string} key - Usually a client IP.
 * @param {{ windowMs: number, max: number }} options
 * @returns {RateLimitResult}
 */
function checkRateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  const allowed = bucket.count <= max;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
  return { allowed, remaining: Math.max(0, max - bucket.count), retryAfterSeconds };
}

/**
 * Extracts a best-effort client identifier from the request. Vercel
 * populates x-forwarded-for with the client IP first in the chain; we
 * deliberately take only the first entry — later entries are proxies we
 * don't control, and trusting them would let a client spoof its way into
 * a fresh bucket by appending fake entries.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function clientKeyFromRequest(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null;
  return ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Starts a periodic sweep that evicts stale buckets, so this Map can't
 * grow unbounded over a long-lived instance's lifetime. Safe to call on
 * every request — only schedules once per instance.
 * @param {number} maxWindowMs - Largest windowMs in use, so nothing is swept early.
 */
function ensureSweepScheduled(maxWindowMs) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= maxWindowMs) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't let this timer keep the process alive on its own.
  sweepTimer.unref?.();
}

module.exports = { checkRateLimit, clientKeyFromRequest, ensureSweepScheduled };
