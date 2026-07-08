# BERN-AI (secure, free-models-only, multilingual edition)

This version never puts your OpenRouter API key in any file — it lives only
in Vercel's Environment Variables, server-side, in the `/api/chat`
serverless function. The browser calls `/api/chat`; it never sees the key.

## What's in this build

- **Answer language, your choice.** A "Pinulongan sa Tubag" dropdown lets
  you pick the language BERN-AI answers in — English is the default, with
  Binisaya/Cebuano, Filipino, Spanish, Japanese, Korean, Chinese, French,
  German, Arabic, or a free-text "other" option. Only the AI's *answer*
  changes language; the interface labels stay as-is. This is sent as a
  `language` field to `/api/chat`, which builds the system prompt around
  it server-side (see `api/chat.js`).
- **Day / night mode.** A toggle button (top-right, always visible) flips
  between a dark "night" theme and a light "day" theme. The choice is
  remembered in the browser (`localStorage`) and applied before first
  paint, so there's no flash of the wrong theme on reload.
- **Jeepney-signboard visual identity.** A yellow destination-board
  header, a "capacity" readout per model (mapped from context length,
  like seats on a ride), a mini jeepney driving along a dashed route
  while a reply is in transit, and a torn-ticket style card for the
  answer.
- **Ambient code-rain background.** A blurred, low-opacity layer of
  drifting code snippets behind everything — purely decorative
  (`aria-hidden`), GPU-cheap, and automatically disabled for people with
  `prefers-reduced-motion` set.
- **Responsive.** Single-column on phones, a two-column settings grid on
  wider screens, safe-area padding for notched phones, and a minimum
  44px tap target on the theme toggle.

## Files

Split into separate files on purpose — one job per file, easier to
maintain and diff than one giant HTML page:

- `index.html` — page structure only. Sets the theme attribute inline
  (before CSS loads) to avoid a flash of the wrong theme, then loads
  `styles.css` and `app.js`. Contains no secrets.
- `styles.css` — all styling. Day/night themes are just two blocks of
  CSS custom properties (`:root` / `[data-theme="day"]`); every
  component reads `var(--color-*)`, so nothing else needs to change to
  add a third theme later.
- `app.js` — all interactive logic, organized as one `init*()` function
  per feature (theme, code-rain, language selector, model loading,
  chat) plus a single `init()` that wires them up on `DOMContentLoaded`.
- `api/models.js` — serverless function that returns the current list of
  free OpenRouter models.
- `api/chat.js` — serverless function that reads `OPENROUTER_API_KEY` from
  the environment, verifies the requested model is free, sanitizes and
  applies the requested answer language, and forwards the chat request
  to OpenRouter.
- `lib/freeModels.js` — shared helper (used by both API functions) that
  fetches and caches OpenRouter's free-model list.
- `.env.example` — template only; your real key never goes in a file
  that gets committed.

## How the free-model safety net works

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

## Notes

- The signboard tagline ("Bisaya na AI, tanan pangutana tubagon sa nga
  binisaya...") is kept as written, but since the actual default is now
  English with a language switcher, you may want to revisit that line —
  it's in the `.signboard__dest` element in `index.html`.
- To add another answer language, just add an entry to `LANGUAGE_OPTIONS`
  in `app.js` — no backend changes needed, since `api/chat.js` accepts
  any language name and drops it straight into the system prompt
  (sanitized for length and stray characters).
