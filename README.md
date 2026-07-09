# BERN-AI

A small, free, multilingual AI chat app with a jeepney-signboard visual
identity. The OpenRouter API key never touches the browser — it lives only
in a Vercel serverless function.

## What's new in this build

- **A dashboard gauge as the theme control.** The old sun/moon icon-swap
  button is now a small instrument-cluster dial: a needle sweeps across a
  semicircular track between a moon (night) and a sun (day) icon,
  reading the same `--sky-t` value that drives the background. It's both
  a live readout of the time-of-day state and the click target that
  overrides it — one piece embodying both the "dynamic weather" system
  and the jeepney-dashboard visual world.
- **Full-UI internationalization.** Switching the answer language
  re-renders the *entire interface* — labels, placeholders, buttons,
  error copy, everything — not just the AI's reply. English is the
  default and the fallback for any missing string. The only text that
  never translates is the brand name, "BERN-AI".
- **Dynamic, time-aware sky.** A `--sky-t` CSS variable (0 → night, 1 →
  day) is continuously recalculated from the visitor's local clock
  across dawn/dusk checkpoints, easing the background gradient, a
  star field, and the gauge needle together. Tapping the gauge switches
  to a fixed manual override instead (persisted across visits).
- **Canvas-based code rain.** The ambient "hacker" background is a real
  `<canvas>` animation (`js/codeRain.js`) — falling glyphs with a fading
  trail, colored from the live theme accent. Respects
  `prefers-reduced-motion`.
- **Star field + grain texture.** A scattered star field fades in at
  night (pure CSS, driven by `--sky-t`), and a very low-opacity noise
  texture sits over the whole page for a tactile, less-flat surface.
  Both are pointer-events: none and cost no extra JS.
- **Chrome-lettering title.** The "BERN-AI" wordmark gets a metallic
  sheen blended on top of its solid, fully-readable base color —
  styled after the cutout chrome nameplates real jeepneys carry on
  their hood or dashboard.
- **Capacity gauge bar.** The model's context-length readout is now a
  small log-scaled load bar instead of plain text — a literal visual for
  the "Kapasidad" (capacity) language already used in the copy, echoing
  a jeepney's fuel/passenger-load gauge.
- **Standard Vercel project layout.** All static assets now live under
  `public/`, with `api/` and `lib/` at the project root — the
  conventional layout Vercel's zero-config static + serverless-functions
  deploy expects. Added `favicon.svg`, `manifest.json`, `robots.txt`,
  and an explicit `vercel.json` for static-asset cache headers.

## Architecture

```
public/                Everything the browser loads directly.
  index.html            Page shell only. data-i18n hooks mark
                         translatable text; no copy is hardcoded here.
  favicon.svg            Route-badge icon, matches the signboard style.
  manifest.json          Web app manifest (name, theme color, icon).
  robots.txt              Allows crawling of the app, blocks /api/.
  css/
    main.css              Entry point — imports every module in order.
    tokens.css            Color, sky, type-scale, motion variables.
                           Nothing else in css/ hardcodes a color value.
    base.css               Reset + base typography + focus rings.
    sky.css                 Dynamic background: gradient, star field,
                            canvas code-rain, grain texture.
    layout.css             Page-level structure (.app shell, footer).
    components.css         Every UI widget: signboard + chrome title,
                            dashboard gauge toggle, panels, forms,
                            buttons, transit animation, capacity gauge,
                            response ticket.
    responsive.css         Breakpoint overrides only.
  js/
    main.js                Composition root — queries the DOM once,
                            wires every module together. No business
                            logic here.
    i18n.js                Translation dictionary + engine. Single
                            source of truth for every UI string in
                            every language.
    theme.js                Day/night + time-of-day sky controller.
    codeRain.js              Canvas animation class.
    api.js                  Thin fetch wrapper for /api/models and
                            /api/chat.
    modelSelector.js        Owns the model <select>: fetch, render,
                            capacity gauge.
    languageSelector.js     Owns the language <select>: drives
                            i18n.setLocale.
    chatPanel.js             Owns the composer, request lifecycle,
                            response rendering.
api/                    Vercel serverless functions (must stay at the
                         project root, alongside public/, not inside it).
  models.js               Live list of currently-free OpenRouter models.
  chat.js                  Re-verifies the requested model is free,
                            builds the language-aware system prompt,
                            forwards to OpenRouter. Holds the API key.
lib/
  freeModels.js            Shared, cached "what's free right now"
                            lookup used by both serverless functions.
vercel.json              Explicit cache headers for static assets.
.env.example              Template only — your real key never goes in
                          a committed file.
```

Each JS module owns exactly one concern and exposes a small class or
function API; `main.js` is the only file that knows how they fit
together. Adding a new language means editing `i18n.js` only — no
changes to `main.js`, the HTML, or the backend. Adding a new UI string
means adding one key to every locale block in `i18n.js` and one
`data-i18n` attribute in `index.html`.

## How the free-model safety net works

- `/api/models` asks OpenRouter which models are free *right now* (price
  = $0 for both prompt and completion tokens) and returns that list. The
  frontend fills the dropdown from this endpoint on page load.
- `/api/chat` independently re-checks the requested model against that
  same live free list before forwarding the request. If a non-free or
  unknown model ID ever reached the server, it falls back to the first
  available free model instead of forwarding the request.
- Both endpoints cache OpenRouter's model list for a few minutes.

## How the language system works

- `i18n.js` holds one `strings` object per locale, keyed by dot-path
  (e.g. `composer.ask`). English is `DEFAULT_LOCALE` and doubles as the
  fallback for any key missing in another locale.
- `LanguageSelector` (`languageSelector.js`) is the only place that calls
  `i18n.setLocale()`. Choosing a language does two things: sets the
  `language` value sent to `/api/chat` (via `promptNameFor`) **and**
  swaps the whole UI's copy (via `i18n.applyToDocument()`), which walks
  every `[data-i18n]` / `[data-i18n-placeholder]` / `[data-i18n-aria-label]`
  element in the DOM.
- The backend (`api/chat.js`) still accepts free-text language names, so
  picking "Other…" and typing anything works without backend changes —
  the UI copy simply stays in English for languages we don't ship
  strings for.
- RTL languages (Arabic) automatically flip `dir="rtl"` on `<html>`.

## How the dynamic sky works

- `theme.js` maintains a small table of local-hour checkpoints (dawn ~6am,
  full day ~8am–5pm, dusk ~6pm, full night ~8pm–5am) and linearly
  interpolates a `--sky-t` value between them every 5 minutes while in
  `auto` mode.
- `sky.css` reads `--sky-t` in three places: to position/fade the radial
  gradient behind everything, to fade the star field in and out, and
  (in `components.css`) to rotate the dashboard gauge's needle — so the
  backdrop, the stars, and the toggle control all move together as one
  system, no weather API required.
- Tapping the gauge switches out of `auto` into an explicit `day`/`night`
  override (stored in `localStorage`); the needle then snaps to a fixed
  end of the dial instead of continuing to track the clock.

## Deploy to GitHub + Vercel

1. **Push this folder to a new GitHub repo.** `.gitignore` already
   excludes `.env`.
2. **Get a fresh OpenRouter API key** at https://openrouter.ai/keys.
   (If a key was ever pasted into a chat, screenshot, or committed
   before, treat it as burned — revoke and regenerate.)
3. **Import the repo into Vercel** — Framework preset: "Other" (static
   site + two small serverless functions, no build step).
4. **Add the environment variable in Vercel:**
   Project → Settings → Environment Variables →
   `OPENROUTER_API_KEY` = your new key (Production, plus
   Preview/Development if you want local parity).
5. **Deploy.** The key lives only in Vercel's encrypted environment
   variable store — never in the repo, the deployed bundle, or
   view-source.

## Local testing

```bash
npm install -g vercel
cp .env.example .env
# edit .env and paste your key there (gitignored)
vercel dev
```

## Adding a language

1. Add a new entry to `LOCALES` in `js/i18n.js` with a `label`,
   `promptName`, and a full `strings` object (copy the `en` block as a
   template and translate every value).
2. If the language is right-to-left, add its code to `RTL_LOCALES`.
3. That's it — `LanguageSelector` picks it up automatically from
   `i18n.options`, and `api/chat.js` needs no changes since it already
   accepts any `promptName` as free text.
