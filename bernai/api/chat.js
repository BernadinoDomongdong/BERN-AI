// This function runs on Vercel's servers, never in the visitor's browser.
// The API key lives only in Vercel's Environment Variables (see README),
// so it's never present in any file that gets committed to GitHub.

const { fetchFreeModels } = require('../lib/freeModels');

const DEFAULT_LANGUAGE = 'English';
const MAX_LANGUAGE_LENGTH = 40;

/**
 * The frontend lets the person pick which language the answer should be
 * in (English by default). We never trust that string blindly, since
 * it flows straight into a system prompt: strip newlines/control
 * characters and cap the length so it can't be used to smuggle extra
 * instructions in.
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

/** Builds the system prompt that forces the reply into the chosen language. */
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

/** Re-checks the requested model against the live free-model list. */
async function resolveFreeModel(requestedModelId) {
  const freeModels = await fetchFreeModels();
  const freeModelIds = new Set(freeModels.map((m) => m.id));

  if (freeModelIds.size === 0) {
    return { error: 'No free models are currently available on OpenRouter. Try again later.', status: 503 };
  }

  const chosenModel = freeModelIds.has(requestedModelId) ? requestedModelId : freeModels[0].id;
  return { chosenModel };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { message, model, language } = req.body || {};

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing "message" in request body' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'Server is missing OPENROUTER_API_KEY. Set it in Vercel > Project Settings > Environment Variables.',
    });
    return;
  }

  // Never trust the model string from the browser as-is. Re-check it
  // against OpenRouter's live list of free models so a request can never
  // accidentally (or deliberately) hit a paid model and rack up charges.
  let resolved;
  try {
    resolved = await resolveFreeModel(model);
  } catch (err) {
    res.status(502).json({ error: 'Could not verify free model list: ' + err.message });
    return;
  }

  if (resolved.error) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  const systemPrompt = buildSystemPrompt(sanitizeLanguage(language));

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://www.bernarddev.com',
        'X-Title': 'BERN-AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolved.chosenModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data.error?.message || 'OpenRouter request failed' });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};
