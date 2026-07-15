/**
 * api/models.js — Vercel serverless function.
 *
 * Returns the list of models that are *currently* free on OpenRouter, so
 * the frontend never has to hardcode model names that can change or
 * disappear.
 */

'use strict';

const { fetchFreeModels } = require('../lib/freeModels');
const { checkRateLimit, clientKeyFromRequest, ensureSweepScheduled } = require('../lib/rateLimit');
const { mintToken } = require('../lib/formToken');

const CACHE_CONTROL_HEADER = 's-maxage=300, stale-while-revalidate=600';

// Looser than /api/chat's limit: this endpoint is read-only, cheap
// (backed by freeModels.js's own cache), and not billed per-request —
// it mainly needs protection from being hit hard enough to defeat that
// cache's purpose. See lib/rateLimit.js for what this protection does
// and doesn't cover.
const RATE_LIMIT = { windowMs: 60 * 1000, max: 30 };

// This endpoint also mints the anti-automation token every real visitor
// needs to reach /api/chat (see lib/formToken.js), so it gets its own
// global budget too — otherwise a flood here would be a backdoor around
// /api/chat's own global limit by just... not calling /api/chat first.
const GLOBAL_RATE_LIMIT_KEY = '__global_models__';
const GLOBAL_RATE_LIMIT = {
  windowMs: 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_PER_MINUTE) || 60,
};

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  ensureSweepScheduled(Math.max(RATE_LIMIT.windowMs, GLOBAL_RATE_LIMIT.windowMs));
  const clientKey = clientKeyFromRequest(req);
  const rate = checkRateLimit(clientKey, RATE_LIMIT);
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT.max));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds));
    res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' });
    return;
  }

  const globalRate = checkRateLimit(GLOBAL_RATE_LIMIT_KEY, GLOBAL_RATE_LIMIT);
  if (!globalRate.allowed) {
    res.setHeader('Retry-After', String(globalRate.retryAfterSeconds));
    res.status(429).json({ error: 'This app is getting more traffic than usual right now — please try again shortly.' });
    return;
  }

  try {
    const models = await fetchFreeModels();
    // Let Vercel's edge cache this for a bit too, so repeat visitors
    // don't all hit OpenRouter at once.
    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    // mintToken() returns null when FORM_TOKEN_SECRET isn't configured —
    // spread of null is a no-op, so the response shape is unchanged
    // (and /api/chat's verifyToken() fails open the same way) until the
    // env var is set. See lib/formToken.js.
    res.status(200).json({ models, ...mintToken() });
  } catch (err) {
    console.error('Unexpected error in /api/models:', err);
    res.status(500).json({ error: err.message || 'Could not load free model list' });
  }
};
