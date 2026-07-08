// Shared helper used by api/models.js and api/chat.js.
//
// OpenRouter adds, removes, and renames free models often, so we never
// hardcode model IDs. Instead we ask OpenRouter's public model list which
// ones are free right now (pricing.prompt === "0" and pricing.completion
// === "0"), and cache the answer for a few minutes to avoid hitting that
// endpoint on every single chat message.

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache = {
  timestamp: 0,
  models: [], // [{ id, name, context_length }]
};

function isFree(model) {
  const prompt = parseFloat(model?.pricing?.prompt ?? '1');
  const completion = parseFloat(model?.pricing?.completion ?? '1');
  return prompt === 0 && completion === 0;
}

async function fetchFreeModels() {
  const now = Date.now();
  if (now - cache.timestamp < CACHE_TTL_MS && cache.models.length > 0) {
    return cache.models;
  }

  // The /models endpoint is public on OpenRouter and doesn't require a key.
  const upstream = await fetch('https://openrouter.ai/api/v1/models');
  if (!upstream.ok) {
    // If OpenRouter is having trouble, serve the last known-good list
    // (if any) instead of failing outright.
    if (cache.models.length > 0) return cache.models;
    throw new Error(`OpenRouter models lookup failed (HTTP ${upstream.status})`);
  }

  const data = await upstream.json();
  const models = (data.data || [])
    .filter(isFree)
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { timestamp: now, models };
  return models;
}

module.exports = { fetchFreeModels };
