/**
 * theme.js — day / night theme with a time-aware "sky" gradient.
 *
 * Modes:
 *  - 'auto'  (default): theme follows the visitor's LOCAL time at their
 *            actual location. On init we ask for geolocation; if granted,
 *            we resolve the UTC offset for those coordinates (via a small
 *            public timezone lookup) so the sky reflects where the person
 *            really is, not just their device's configured timezone. If
 *            permission is denied, unavailable, or the lookup fails, we
 *            fall back immediately to the device's own clock — so 'auto'
 *            always works, just slightly less precise without location.
 *            The background isn't just a hard day/night flip — CSS custom
 *            properties are interpolated across four checkpoints
 *            (dawn / day / dusk / night) so the sky drifts smoothly as
 *            the hour changes, like an actual transit-terminal display.
 *  - 'day' / 'night': explicit manual override, persisted and re-applied
 *            on every visit until the person switches back to auto.
 *
 * The gauge (toggle button) always reflects --sky-t. Clicking the gauge
 * itself is a quick manual override (like flipping a light switch); a
 * separate small switch underneath lets the person turn auto mode back
 * on at any time.
 */

const STORAGE_KEY = 'bernai-theme';
const MODE_STORAGE_KEY = 'bernai-theme-mode'; // 'auto' | 'manual', independent of the day/night value itself
const RECHECK_INTERVAL_MS = 60 * 1000; // re-evaluate sky position every minute (was 5 min — location resolves once, clock still needs to tick)
const GEOLOCATION_TIMEOUT_MS = 8000;
const GEOLOCATION_MAX_AGE_MS = 10 * 60 * 1000;

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
        this._mode = 'auto'; // 'auto' | 'day' | 'night' (kept for back-compat with the manual value)
        this._autoOn = true; // separate flag: is auto-follow currently active
        this._intervalId = null;
        /** Resolved UTC offset in minutes for the visitor's real location.
         *  Null until geolocation resolves (or fails), during which we
         *  use the device's own timezone as an immediate, safe default. */
        this._locationUtcOffsetMin = null;
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

    _loadStoredAutoFlag() {
        try {
            const stored = localStorage.getItem(MODE_STORAGE_KEY);
            if (stored === 'manual') return false;
            return true; // default: auto
        } catch {
            return true;
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

    _persistAutoFlag(isAuto) {
        try {
            localStorage.setItem(MODE_STORAGE_KEY, isAuto ? 'auto' : 'manual');
        } catch {
            /* non-fatal */
        }
    }

    _applyTheme(theme, skyT) {
        this.root.setAttribute('data-theme', theme);
        this.root.style.setProperty('--sky-t', String(skyT));
    }

    /** Local hour-of-day, using the geolocation-resolved offset when we
     *  have one, otherwise the device's own timezone. Always returns
     *  something usable — never blocks on the geolocation prompt. */
    _resolvedHourFloat() {
        const now = new Date();
        if (this._locationUtcOffsetMin === null) {
            return now.getHours() + now.getMinutes() / 60;
        }
        const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
        const localMs = utcMs + this._locationUtcOffsetMin * 60000;
        const local = new Date(localMs);
        return local.getHours() + local.getMinutes() / 60;
    }

    /** Recomputes and applies the sky state (only matters while in 'auto'). */
    _tickAuto() {
        if (!this._autoOn) return;
        const { theme, skyT } = skyStateForHour(this._resolvedHourFloat());
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

    get isAuto() {
        return this._autoOn;
    }

    /** Call once, as early as possible (before first paint ideally). */
    init() {
        this._mode = this._loadStoredMode();
        this._autoOn = this._mode === 'auto' && this._loadStoredAutoFlag();

        if (this._autoOn) {
            this._tickAuto();
            this._resolveLocation();
            this._intervalId = window.setInterval(() => this._tickAuto(), RECHECK_INTERVAL_MS);
        } else {
            const fixed = this._mode === 'day' || this._mode === 'night' ? this._mode : 'night';
            this._applyTheme(fixed, fixed === 'day' ? 1 : 0);
        }
    }

    /** Asks for geolocation and, if granted, resolves a UTC offset for
     *  those coordinates so the sky matches the visitor's real location
     *  rather than just their device's configured timezone. Never blocks
     *  rendering — device timezone is already in effect the whole time
     *  this is pending. */
    async _resolveLocation() {
        if (!('geolocation' in navigator)) return;

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(
                        `https://timeapi.io/api/timezone/coordinate?latitude=${latitude}&longitude=${longitude}`
                    );
                    if (!res.ok) return;
                    const data = await res.json();
                    if (typeof data.currentUtcOffset?.seconds === 'number') {
                        this._locationUtcOffsetMin = data.currentUtcOffset.seconds / 60;
                        this._tickAuto();
                    }
                } catch {
                    /* keep device-timezone fallback already in effect */
                }
            },
            () => {
                /* denied/unavailable — device timezone fallback stays in effect */
            },
            { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS }
        );
    }

    /** Explicit user toggle on the gauge itself — always drops into a
     *  fixed manual day/night, like flipping a light switch. */
    toggle() {
        const next = this.currentTheme === 'night' ? 'day' : 'night';
        this._mode = next;
        this._autoOn = false;
        this._persistMode(next);
        this._persistAutoFlag(false);
        if (this._intervalId) {
            window.clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._applyTheme(next, next === 'day' ? 1 : 0);
        this._notify(next);
    }

    /** Called by the auto/manual switch under the gauge. Turning auto
     *  back on re-resolves location and resumes the live sky. */
    setAuto(isAuto) {
        this._autoOn = isAuto;
        this._persistAutoFlag(isAuto);

        if (isAuto) {
            this._mode = 'auto';
            this._persistMode('auto');
            this._tickAuto();
            this._resolveLocation();
            if (!this._intervalId) {
                this._intervalId = window.setInterval(() => this._tickAuto(), RECHECK_INTERVAL_MS);
            }
        } else {
            // Freeze on whatever theme is currently showing.
            this._mode = this.currentTheme;
            this._persistMode(this._mode);
            if (this._intervalId) {
                window.clearInterval(this._intervalId);
                this._intervalId = null;
            }
        }
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
        var mode = localStorage.getItem('${MODE_STORAGE_KEY}');
        if (mode === 'manual' && (stored === 'day' || stored === 'night')) {
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
