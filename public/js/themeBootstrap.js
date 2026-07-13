/**
 * themeBootstrap.js — sets the initial theme + sky position before first
 * paint, so there's no flash of the wrong palette.
 *
 * Loaded as a plain classic <script> (not a module) directly in <head>,
 * deliberately outside main.js's module graph, so it can run
 * synchronously before CSS loads. Kept as its own file rather than an
 * inline <script> in index.html so the site's Content-Security-Policy
 * can use a strict script-src allowlist with no 'unsafe-inline'.
 *
 * Mirrors theme.js's own decision logic (see THEME_BOOTSTRAP_RULE below)
 * — kept in sync manually since this file must stand alone, before any
 * ES module loads.
 */
(function () {
    var THEME_KEY = 'bernai-theme';
    var EXPLICIT_KEY = 'bernai-theme-explicit';

    try {
        var storedTheme = localStorage.getItem(THEME_KEY);
        var isExplicit = localStorage.getItem(EXPLICIT_KEY) === '1';
        if (isExplicit && (storedTheme === 'day' || storedTheme === 'night')) {
            document.documentElement.setAttribute('data-theme', storedTheme);
            document.documentElement.style.setProperty('--sky-t', storedTheme === 'day' ? '1' : '0');
            return;
        }
    } catch (e) {
        // Storage unavailable (private browsing, disabled cookies) — fall
        // through to the time-based default below.
    }

    // THEME_BOOTSTRAP_RULE: AM local hours -> day, PM -> night. This is a
    // device-clock approximation only; theme.js upgrades it to the
    // visitor's actual location-resolved time shortly after load.
    var isDay = new Date().getHours() < 12;
    document.documentElement.setAttribute('data-theme', isDay ? 'day' : 'night');
    document.documentElement.style.setProperty('--sky-t', isDay ? '1' : '0');
})();
