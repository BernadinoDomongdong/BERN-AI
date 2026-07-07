// This function runs on Vercel's servers, never in the visitor's browser.
// The API key lives only in Vercel's Environment Variables (see README),
// so it's never present in any file that gets committed to GitHub.

const { fetchFreeModels } = require('../lib/freeModels');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { message, model } = req.body || {};

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
  let freeModels;
  try {
    freeModels = await fetchFreeModels();
  } catch (err) {
    res.status(502).json({ error: 'Could not verify free model list: ' + err.message });
    return;
  }

  const freeModelIds = new Set(freeModels.map((m) => m.id));
  if (freeModelIds.size === 0) {
    res.status(503).json({ error: 'No free models are currently available on OpenRouter. Try again later.' });
    return;
  }

  const chosenModel = freeModelIds.has(model) ? model : freeModels[0].id;

  try {
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://www.bernarddev.com',
        'X-Title': 'BernardAi',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [{ role: 'user', content: message }],
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
