# BERN-AI

A small, free, multilingual AI chat app with a jeepney-signboard visual
identity. The OpenRouter API key never touches the browser — it lives only
in a Vercel serverless function.

## What's new in this build

- **A digital LED clock as the theme display, a switch as the only
  control.** The theme control is two separate pieces: a compact
  digital readout (`#themeClock`), styled after the amber dot-matrix
  destination signs jeepneys carry above the windshield, that purely
  *shows* the visitor's resolved local time — it is not a button and
  has no click handler — and a single switch beneath it that is the
  *only* interactive theme control, directly toggling dark mode. The
  readout is always live; the theme itself follows a simple rule
  (1AM–5PM → day, 5PM–1AM → night) until the switch is used, at which
  point that becomes an explicit, persisted choice.
- **Location-aware local time.** On load, the app resolves the visitor's
  local time from their device's timezone immediately, then upgrades to
  their actual geolocation-derived offset if permission is granted — so
  someone traveling with their device still set to a home timezone still
  sees a clock (and theme) that matches where they actually are.
- **Full-UI internationalization.** Switching the answer language
  re-renders the *entire interface* — labels, placeholders, buttons,
  error copy, everything — not just the AI's reply. English is the
  default and the fallback for any missing string. The only text that
  never translates is the brand name, "BERN-AI".
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
    themeBootstrap.js       Pre-paint theme flash guard. Plain classic
                            script (not a module) loaded directly in
                            <head>, so it runs before CSS — kept out of
                            index.html as an external file so the CSP's
                            script-src needs no 'unsafe-inline'.
    i18n.js                Translation dictionary + engine. Single
                            source of truth for every UI string in
                            every language.
    theme.js                Resolves the visitor's local time (device
                            timezone, upgraded via geolocation) and
                            applies AM → day / PM → night, until the
                            dark-mode switch sets an explicit override.
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
                          Rate-limited per IP.
  chat.js                  Re-verifies the requested model is free,
                            builds the language-aware system prompt,
                            forwards to OpenRouter. Holds the API key.
                            Rate-limited and origin-checked per IP.
lib/
  freeModels.js            Shared, cached "what's free right now"
                            lookup used by both serverless functions.
                            De-duplicates concurrent cache-miss requests.
  rateLimit.js              Shared in-memory rate limiter used by both
                            serverless functions. See "Security" below
                            for what this does and doesn't cover.
vercel.json              Explicit cache headers for static assets, plus
                         a site-wide security header set (CSP, HSTS,
                         X-Frame-Options, Permissions-Policy, etc).
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
- Both endpoints cache OpenRouter's model list for a few minutes;
  concurrent requests during a cache miss share a single upstream call
  instead of each firing their own (`lib/freeModels.js`).

## Security

A realistic, layered posture for a small stateless app — not a claim
that any of this makes the app immune to a determined attacker. Here's
exactly what's in place and, just as important, what isn't:

**Input validation (`api/chat.js`)**
- Request body is type- and shape-checked before anything else runs.
- The question is capped at 4000 characters server-side (and mirrored
  client-side in `chatPanel.js` for instant feedback) — cheap to
  enforce, bounds worst-case cost per request.
- The requested answer language is stripped of control characters and
  capped at 40 characters before it's dropped into the system prompt,
  so it can't be used to smuggle extra instructions into the model call.
- The requested model ID is never trusted — it's re-verified against
  OpenRouter's live free list on every request (see above), so a
  request can never reach a paid model.

**Rate limiting (`lib/rateLimit.js`)**
- `/api/chat`: 8 requests/minute per IP. `/api/models`: 30/minute per
  IP (looser — it's read-only and cache-backed). Both return `429` with
  a `Retry-After` header when exceeded.
- **Honestly scoped**: this is an in-memory limiter local to a single
  serverless function instance. Vercel can run multiple instances
  concurrently across regions, so this does *not* provide true
  distributed rate limiting — a distributed attacker can exceed these
  limits by fanning requests across instances. It's a real deterrent
  against casual abuse, misbehaving scripts, and single-source
  hammering, not a guarantee. For genuine cross-instance limiting,
  swap in a shared store — `@upstash/ratelimit` with Upstash Redis is
  a drop-in fit for `lib/rateLimit.js`'s call shape.

**Origin validation (`api/chat.js`)**
- If you set an `ALLOWED_ORIGIN` environment variable (e.g.
  `https://bern-ai.site`), cross-site requests carrying a different
  `Origin` header are rejected with `403`. Requests with no `Origin`
  header at all (some same-origin cases, non-browser tools) are let
  through, since that header isn't reliably present for legitimate
  traffic — so this narrows the attack surface without being a complete
  CSRF solution on its own. Left unset, the check is skipped (fine for
  local dev).

**Security headers (`vercel.json`)**
- Applied site-wide: `Content-Security-Policy` (strict allowlist —
  scripts only from self + `cdn.jsdelivr.net`, no `unsafe-inline`
  anywhere, `connect-src` limited to `self` and `timeapi.io`),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Strict-Transport-Security`, and a `Permissions-Policy` that only
  allows geolocation for this origin itself and blocks camera,
  microphone, and payment APIs outright.
- The pre-paint theme script lives in its own file
  (`js/themeBootstrap.js`) instead of an inline `<script>` specifically
  so the CSP's `script-src` doesn't need `'unsafe-inline'` — inline
  scripts are one of the more common XSS escalation paths, so removing
  the need for that directive is worth the one extra file.

**Timeouts, everywhere a network call happens**
- Client → `/api/*`: 30s, combined with the user's own "Stop" button via
  `AbortSignal.any`.
- `/api/chat` → OpenRouter: 30s. `lib/freeModels.js` → OpenRouter: 10s.
  A hung upstream can't hang this app's requests indefinitely.

**What this does *not* cover — and what would, if you need it**
- **Volumetric/network-layer DDoS.** No application code can absorb a
  true flood of traffic; that's handled by Vercel's platform-level DDoS
  protection (always on, in front of every deployment) and, for
  stronger guarantees, a CDN/WAF like Cloudflare or Vercel's Firewall
  in front of the app.
- **True distributed rate limiting** needs a shared store (see above).
- **Bot/credential-stuffing-style abuse detection** would need a
  challenge mechanism (e.g. Vercel's Attack Challenge Mode, a CAPTCHA,
  or Turnstile) — not implemented here, since this app has no auth or
  accounts to credential-stuff in the first place.

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

## How the theme clock works

- `theme.js` resolves the visitor's local time two ways: immediately from
  the device's own timezone (no permission needed), then upgraded to a
  geolocation-derived offset if the visitor grants location access (via
  a small public timezone lookup, `timeapi.io`). The device-timezone
  reading is applied right away either way, so nothing waits on a
  permission prompt.
- The rule is deliberately simple: **1AM–5PM local time → day mode,
  5PM–1AM local time → night (dark) mode.** No dawn/dusk blending — the
  point is that glancing at the readout tells you exactly why you're in
  the mode you're in. The two boundary hours are constants
  (`DAY_START_HOUR`, `DAY_END_HOUR` in `theme.js`) and are mirrored
  manually in `themeBootstrap.js` for the pre-paint guard.
- The clock face (`#themeClock`) is purely a display: a digital LED
  readout (12-hour `H:MM` + `AM`/`PM`, plus a sun/moon glyph that
  cross-fades off the same `--sky-t` scalar the rest of the sky reads)
  that redraws every second from the resolved local time. It is a plain
  `<div>`, not a button — clicking it does nothing, by design. The
  theme itself is only ever re-applied when the 1AM/5PM boundary is
  actually crossed, not on every per-second tick.
- An earlier build used an analog face with three independently rotated
  SVG hands, each needing its own accumulated-angle bookkeeping to keep
  CSS transitions from spinning backward across the 360deg→0deg wrap.
  That geometry was a recurring source of bugs (hands drifting, jumps on
  reload). The digital readout removes the failure mode entirely: it
  just renders the string the clock controller hands it, nothing to
  desync. Digit/icon color is fixed to the accent gold in both themes,
  the same "decorative color never compromises legibility" principle
  documented in `tokens.css`.
- The single switch beneath the clock is the *only* interactive control.
  Flipping it calls `themeController.setDarkMode()`, which sets an
  explicit, persisted theme (`localStorage`) and stops the 1AM/5PM rule
  from overriding it — same as flipping a normal light switch. The
  readout keeps ticking either way; only the day/night decision freezes.
- `--sky-t` (0 → night, 1 → day) always mirrors whichever theme is
  currently applied, whether that came from the auto rule or the
  explicit switch — `sky.css` and the clock's sun/moon glyph both read
  it, so there's one source of truth and nothing can visually disagree
  with the actual `data-theme` attribute.

## Deploy to GitHub + Vercel

1. **Push this folder to a new GitHub repo.** `.gitignore` already
   excludes `.env`.
2. **Get a fresh OpenRouter API key** at https://openrouter.ai/keys.
   (If a key was ever pasted into a chat, screenshot, or committed
   before, treat it as burned — revoke and regenerate.)
3. **Import the repo into Vercel** — Framework preset: "Other" (static
   site + two small serverless functions, no build step).
4. **Add the environment variables in Vercel:**
   Project → Settings → Environment Variables →
   - `OPENROUTER_API_KEY` = your new key (Production, plus
     Preview/Development if you want local parity). Required.
   - `ALLOWED_ORIGIN` = your deployed URL (e.g. `https://bern-ai.site`).
     Optional but recommended for production — see "Security" above;
     without it, `/api/chat` skips its cross-site origin check.
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
