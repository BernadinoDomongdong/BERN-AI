/**
 * theme.js — day / night theme with a time-aware "sky" gradient.
 *
 * Modes:
 *  - 'auto'  (default): theme follows the visitor's local clock. The
 *            background isn't just a hard day/night flip — CSS custom
 *            properties are interpolated across four checkpoints
 *            (dawn / day / dusk / night) so the sky drifts smoothly as
 *            the hour changes, like an actual transit-terminal display.
 *  - 'day' / 'night': explicit manual override via the toggle button,
 *            persisted and re-applied on every visit until cleared.
 *
 * The toggle button always flips between day and night explicitly; there
 * is no UI for re-enabling auto mode once overridden, matching the
 * original single-button interaction — simplicity over completeness here
 * is a deliberate choice, not an oversight.
 */

const STORAGE_KEY = 'bernai-theme';
const RECHECK_INTERVAL_MS = 5 * 60 * 1000; // re-evaluate sky position every 5 min

/**
 * Sky checkpoints as [hour, theme, skyPosition 0-1].
 * skyPosition drives --sky-t, a 0→1 value the CSS gradient/opacity rules
 * key off of, so the background can visually ease between day and night
 * (a proxy for "dynamic weather" without needing a live weather API).
 */
const SKY_CHECKPOINTS = [
    { hour: 0, theme: 'night', t: 0 },
    { hour: 5, theme: 'night', t: 0.1 },
    { hour: 6, theme: 'day', t: 0.35 },   // sunrise
    { hour: 8, theme: 'day', t: 1 },
    { hour: 17, theme: 'day', t: 1 },
    { hour: 18, theme: 'night', t: 0.5 }, // sunset
    { hour: 20, theme: 'night', t: 0.15 },
    { hour: 24, theme: 'night', t: 0 },
];

function interpolate(a, b, t) {
    return a + (b - a) * t;
}

/** Computes { theme, skyT } for the given local hour-of-day (0-23.999). */
function skyStateForHour(hourFloat) {
    for (let i = 0; i < SKY_CHECKPOINTS.length - 1; i++) {
        const cur = SKY_CHECKPOINTS[i];
        const next = SKY_CHECKPOINTS[i + 1];
        if (hourFloat >= cur.hour && hourFloat <= next.hour) {
            const span = next.hour - cur.hour || 1;
            const localT = (hourFloat - cur.hour) / span;
            return {
                theme: localT < 0.5 ? cur.theme : next.theme,
                skyT: interpolate(cur.t, next.t, localT),
            };
        }
    }
    return { theme: 'night', skyT: 0 };
}

class ThemeController {
    constructor(rootEl = document.documentElement) {
        this.root = rootEl;
        this._mode = 'auto'; // 'auto' | 'day' | 'night'
        this._intervalId = null;
    }

    /** Reads any stored manual override; falls back to 'auto'. */
    _loadStoredMode() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === 'day' || stored === 'night' ? stored : 'auto';
        } catch {
            return 'auto';
        }
    }

    _persistMode(mode) {
        try {
            if (mode === 'auto') {
                localStorage.removeItem(STORAGE_KEY);
            } else {
                localStorage.setItem(STORAGE_KEY, mode);
            }
        } catch {
            /* non-fatal */
        }
    }

    _applyTheme(theme, skyT) {
        this.root.setAttribute('data-theme', theme);
        this.root.style.setProperty('--sky-t', String(skyT));
    }

    /** Recomputes and applies the sky state (only matters while in 'auto'). */
    _tickAuto() {
        if (this._mode !== 'auto') return;
        const now = new Date();
        const hourFloat = now.getHours() + now.getMinutes() / 60;
        const { theme, skyT } = skyStateForHour(hourFloat);
        this._applyTheme(theme, skyT);
        this._notify(theme);
    }

    _notify(theme) {
        this._listeners?.forEach((fn) => fn(theme));
    }

    onChange(fn) {
        this._listeners = this._listeners || new Set();
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    get currentTheme() {
        return this.root.getAttribute('data-theme') || 'night';
    }

    /** Call once, as early as possible (before first paint ideally). */
    init() {
        this._mode = this._loadStoredMode();

        if (this._mode === 'auto') {
            this._tickAuto();
            this._intervalId = window.setInterval(() => this._tickAuto(), RECHECK_INTERVAL_MS);
        } else {
            // Manual override: static theme, sky fully settled (t=1 for day, 0 for night).
            this._applyTheme(this._mode, this._mode === 'day' ? 1 : 0);
        }
    }

    /** Explicit user toggle — always switches mode to a fixed day/night. */
    toggle() {
        const next = this.currentTheme === 'night' ? 'day' : 'night';
        this._mode = next;
        this._persistMode(next);
        if (this._intervalId) {
            window.clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._applyTheme(next, next === 'day' ? 1 : 0);
        this._notify(next);
    }
}

export const themeController = new ThemeController();

/**
 * Inline bootstrap snippet (as a string) to be placed in <head>, run
 * synchronously before CSS loads, so there is no flash of the wrong
 * theme. Kept here so the logic that decides the initial theme lives in
 * exactly one place instead of being duplicated between this module and
 * a hand-written <script> tag in index.html.
 */
export const THEME_BOOTSTRAP_SNIPPET = `
(function () {
    try {
        var stored = localStorage.getItem('${STORAGE_KEY}');
        if (stored === 'day' || stored === 'night') {
            document.documentElement.setAttribute('data-theme', stored);
            document.documentElement.style.setProperty('--sky-t', stored === 'day' ? '1' : '0');
            return;
        }
    } catch (e) {}
    var h = new Date().getHours();
    var isDay = h >= 6 && h < 18;
    document.documentElement.setAttribute('data-theme', isDay ? 'day' : 'night');
    document.documentElement.style.setProperty('--sky-t', isDay ? '1' : '0');
})();
`.trim();
