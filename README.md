# BernardAi (secure, free-models-only version, Bisaya edition)

**Bisaya nga tubag, otomatik.** `api/chat.js` sends a Bisaya/Cebuano
system prompt with every request, so BernardAi always answers in Bisaya —
no matter what language the question is asked in (English, Tagalog,
etc.), and no extra toggle needed on the frontend. The UI text (labels,
buttons, status/error messages) has also been translated to Bisaya. If
you ever want to switch the reply language back to English, just edit or
remove `SYSTEM_PROMPT` in `api/chat.js`.

This version never puts your OpenRouter API key in any file — it lives only
in Vercel's Environment Variables, server-side, in the `/api/chat`
serverless function. The browser calls `/api/chat`; it never sees the key.

**What changed:** the model dropdown used to be a hardcoded list, which
meant it could go stale or accidentally include a paid model. Now:

- `/api/models` asks OpenRouter which models are free *right now*
  (price = $0 for both prompt and completion tokens) and returns that
  list. The frontend fills the dropdown from this endpoint on page load,
  so it always reflects what's actually free and available.
- `/api/chat` independently re-checks the model you picked against that
  same live free list before forwarding your request. If somehow a
  non-free or unknown model ID ever reached the server, it falls back to
  the first available free model instead of forwarding the request —
  so you can never accidentally get billed.
- Both endpoints cache OpenRouter's model list for a few minutes so
  normal use doesn't hammer OpenRouter's API.

## Deploy to GitHub + Vercel

1. **Create a new GitHub repo** and push this folder to it as-is.
   The `.gitignore` already excludes `.env`, so there's nothing secret to
   worry about committing.

2. **Get a fresh OpenRouter API key.**
   Go to https://openrouter.ai/keys and generate a new key. (If you ever
   pasted a key into a chat, screenshot, or committed it before, treat
   that key as burned — revoke it and make a new one.)

3. **Import the repo into Vercel.**
   - vercel.com > Add New > Project > select your GitHub repo
   - Framework preset: "Other" (it's a static site + two small API
     functions, no build step needed)

4. **Add the environment variable in Vercel** (this is the important step):
   - Project > Settings > Environment Variables
   - Name: `OPENROUTER_API_KEY`
   - Value: your new key from step 2
   - Add it for Production (and Preview/Development if you want)

   Note: `/api/models` doesn't actually need the key (OpenRouter's model
   list is public), but `/api/chat` does, since it sends real chat
   requests.

5. **Deploy.** Vercel builds it automatically. Your key is now only stored
   in Vercel's encrypted environment variable store — not in your repo,
   not in the deployed frontend bundle, not visible via view-source.

## Local testing (optional)

If you want to test locally before deploying:

```bash
npm install -g vercel
cp .env.example .env
# edit .env and paste your key there (this file is gitignored)
vercel dev
```

## Files

- `index.html` — frontend UI. Loads the model list from `/api/models` on
  page load, then calls `/api/chat` to ask a question. Contains no secrets.
- `api/models.js` — serverless function that returns the current list of
  free OpenRouter models.
- `api/chat.js` — serverless function that reads `OPENROUTER_API_KEY` from
  the environment, verifies the requested model is free, and forwards the
  chat request to OpenRouter.
- `lib/freeModels.js` — shared helper (used by both API functions) that
  fetches and caches OpenRouter's free-model list.
- `.env.example` — template only; your real key never goes in a file
  that gets committed.
