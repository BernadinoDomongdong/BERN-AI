// Runs on Vercel's servers. Returns the list of models that are
// *currently* free on OpenRouter, so the frontend never has to hardcode
// model names that can change or disappear.

const { fetchFreeModels } = require('../lib/freeModels');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const models = await fetchFreeModels();
    // Let Vercel's edge cache this for a bit too, so repeat visitors
    // don't all hit OpenRouter at once.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load free model list' });
  }
};
