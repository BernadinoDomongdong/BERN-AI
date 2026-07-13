/**
 * lib/freeModels.js — shared helper used by api/models.js and api/chat.js.
 *
 * OpenRouter adds, removes, and renames free models often, so we never
 * hardcode model IDs. Instead we ask OpenRouter's public model list which
 * ones are free right now (pricing.prompt === "0" and pricing.completion
 * === "0"), and cache the answer for a few minutes to avoid hitting that
 * endpoint on every single chat message.
 */

'use strict';

/**
 * @typedef {Object} FreeModel
 * @property {string} id - OpenRouter model identifier, e.g. "google/gemma-2-9b-it:free".
 * @property {string} name - Human-readable display name.
 * @property {number|null} context_length - Max context window in tokens, if known.
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const UPSTREAM_TIMEOUT_MS = 10 * 1000; // fail fast rather than hang a request indefinitely
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** @type {{ timestamp: number, models: FreeModel[] }} */
let cache = {
  timestamp: 0,
  models: [],
};

/**
 * In-flight request, shared by concurrent callers on a cache miss.
 * Without this, N simultaneous requests that all miss the cache would
 * each fire their own upstream call (a "thundering herd"); instead they
 * all await the same promise and OpenRouter sees exactly one request.
 * @type {Promise<FreeModel[]>|null}
 */
let inflightRequest = null;

/**
 * @param {unknown} model - Raw model entry from OpenRouter's /models response.
 * @returns {boolean} True if both prompt and completion pricing are zero.
 */
function isFree(model) {
  const prompt = parseFloat(model?.pricing?.prompt ?? '1');
  const completion = parseFloat(model?.pricing?.completion ?? '1');
  return prompt === 0 && completion === 0;
}

/**
 * @param {unknown} raw - Parsed JSON body from OpenRouter's /models response.
 * @returns {FreeModel[]} Free models only, normalized and sorted by name.
 */
function normalizeFreeModels(raw) {
  const entries = Array.isArray(raw?.data) ? raw.data : [];
  return entries
    .filter(isFree)
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: typeof m.context_length === 'number' ? m.context_length : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Performs the actual upstream fetch + normalization. Not exported —
 * always go through fetchFreeModels() so caching and de-duplication apply.
 * @returns {Promise<FreeModel[]>}
 */
async function fetchFromUpstream() {
  let response;
  try {
    response = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure or timeout. Serve the last known-good list if we
    // have one instead of failing the whole request outright.
    if (cache.models.length > 0) return cache.models;
    throw new Error(`OpenRouter models lookup failed: ${err.message || 'network error'}`);
  }

  if (!response.ok) {
    if (cache.models.length > 0) return cache.models;
    throw new Error(`OpenRouter models lookup failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  const models = normalizeFreeModels(data);
  cache = { timestamp: Date.now(), models };
  return models;
}

/**
 * Returns the current list of free OpenRouter models, using a short-lived
 * cache to avoid hammering OpenRouter on every request. Concurrent
 * callers during a cache miss share a single upstream request.
 * @returns {Promise<FreeModel[]>}
 */
async function fetchFreeModels() {
  const isCacheFresh = Date.now() - cache.timestamp < CACHE_TTL_MS && cache.models.length > 0;
  if (isCacheFresh) return cache.models;

  if (!inflightRequest) {
    inflightRequest = fetchFromUpstream().finally(() => {
      inflightRequest = null;
    });
  }

  return inflightRequest;
}

module.exports = { fetchFreeModels };
