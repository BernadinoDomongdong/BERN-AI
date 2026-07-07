# BernardAi (secure version)

This version never puts your OpenRouter API key in any file. The key lives
only in Vercel's Environment Variables, server-side, in the `/api/chat`
serverless function. The browser calls `/api/chat`; it never sees the key.

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
   - Framework preset: "Other" (it's a static site + one API function,
     no build step needed)

4. **Add the environment variable in Vercel** (this is the important step):
   - Project > Settings > Environment Variables
   - Name: `OPENROUTER_API_KEY`
   - Value: your new key from step 2
   - Add it for Production (and Preview/Development if you want)

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

- `index.html` — frontend UI, calls `/api/chat`, contains no secrets
- `api/chat.js` — serverless function, reads `OPENROUTER_API_KEY` from
  the environment and forwards the request to OpenRouter
- `.env.example` — template only; your real key never goes in a file
  that gets committed
