/**
 * theme.js — day / night theme, synced to the visitor's real local time.
 *
 * Rule: AM local hours -> day mode, PM local hours -> night (dark) mode.
 * This is intentionally a simple, predictable rule rather than a dawn/
 * dusk gradient — the whole point is that a person can glance at the
 * clock face and know exactly which mode they're in and why.
 *
 * Local time is resolved as precisely as we can get it without asking
 * for anything invasive: the device's own timezone is used immediately
 * (no permission needed), then upgraded to the visitor's actual
 * geolocation-derived offset if they grant that permission — so someone
 * traveling with their device still set to their home timezone still
 * sees the theme match where they actually are.
 *
 * Control model: the clock face itself is a pure, non-interactive
 * display (see index.html — it's a plain <div>, not a button). The only
 * interactive control is a single switch, which directly toggles dark
 * mode. Flipping it is an explicit, persisted choice that overrides the
 * AM/PM auto-sync from then on — like a normal light switch, not a
 * three-state auto/manual selector.
 */

const THEME_STORAGE_KEY = 'bernai-theme';
const EXPLICIT_STORAGE_KEY = 'bernai-theme-explicit';
const TICK_INTERVAL_MS = 1000; // drives the second hand — see _tick()
const GEOLOCATION_TIMEOUT_MS = 8000;
const GEOLOCATION_MAX_AGE_MS = 10 * 60 * 1000;
const TIMEZONE_LOOKUP_URL = 'https://timeapi.io/api/timezone/coordinate';

class ThemeController {
    /** @param {HTMLElement} rootEl */
    constructor(rootEl = document.documentElement) {
        this.root = rootEl;
        /** True once the person has explicitly used the switch; auto-sync
         *  stops adjusting the theme (but the clock keeps ticking) once true. */
        this._isExplicit = false;
        /** @type {number|null} */
        this._tickIntervalId = null;
        /** Resolved UTC offset in minutes for the visitor's real location.
         *  Null until geolocation resolves (or fails), during which we
         *  use the device's own timezone as an immediate, safe default. */
        this._locationUtcOffsetMin = null;

        /** @type {Set<(theme: string) => void>} */
        this._themeListeners = new Set();
        /** @type {Set<(time: { hour: number, minute: number, second: number }) => void>} */
        this._tickListeners = new Set();
    }

    /**
     * @returns {{ isExplicit: boolean, theme: 'day'|'night'|null }}
     */
    _loadStoredPreference() {
        try {
            const isExplicit = localStorage.getItem(EXPLICIT_STORAGE_KEY) === '1';
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            const theme = stored === 'day' || stored === 'night' ? stored : null;
            return { isExplicit: isExplicit && theme !== null, theme };
        } catch {
            return { isExplicit: false, theme: null };
        }
    }

    /** @param {'day'|'night'} theme */
    _persistExplicitChoice(theme) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
            localStorage.setItem(EXPLICIT_STORAGE_KEY, '1');
        } catch {
            /* storage unavailable — non-fatal, choice just won't persist across visits */
        }
    }

    /** @param {'day'|'night'} theme */
    _applyTheme(theme) {
        this.root.setAttribute('data-theme', theme);
        // Sky visuals (stars, sun rays, clouds) always mirror the theme
        // that's actually showing, whether it got there via auto-sync or
        // an explicit override — one source of truth, no divergence.
        this.root.style.setProperty('--sky-t', theme === 'day' ? '1' : '0');
        this._themeListeners.forEach((fn) => fn(theme));
    }

    /**
     * Local time-of-day, using the geolocation-resolved offset when
     * available, otherwise the device's own timezone. Always returns
     * something usable — never blocks on the geolocation prompt.
     * @returns {{ hour: number, minute: number, second: number }}
     */
    _resolvedLocalTime() {
        const now = new Date();
        if (this._locationUtcOffsetMin === null) {
            return { hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds() };
        }
        const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
        const local = new Date(utcMs + this._locationUtcOffsetMin * 60000);
        return { hour: local.getHours(), minute: local.getMinutes(), second: local.getSeconds() };
    }

    /** @returns {boolean} True during AM hours (00:00–11:59) at the resolved local time. */
    _isDaytimeNow() {
        return this._resolvedLocalTime().hour < 12;
    }

    /** Runs every second: always redraws the clock hands (including the
     *  second hand), and — only while not overridden — re-evaluates the
     *  AM/PM boundary. The theme itself is only ever reapplied when it
     *  actually changes, so a 1-second tick doesn't mean 1-second-interval
     *  DOM writes/listener notifications for the (rare) day/night flip. */
    _tick() {
        if (!this._isExplicit) {
            const nextTheme = this._isDaytimeNow() ? 'day' : 'night';
            if (nextTheme !== this.currentTheme) {
                this._applyTheme(nextTheme);
            }
        }
        const time = this._resolvedLocalTime();
        this._tickListeners.forEach((fn) => fn(time));
    }

    get currentTheme() {
        return this.root.getAttribute('data-theme') || 'night';
    }

    get isDark() {
        return this.currentTheme === 'night';
    }

    get isExplicit() {
        return this._isExplicit;
    }

    /** Subscribe to theme changes (day/night flips, from either auto-sync
     *  or an explicit switch). Returns an unsubscribe function. */
    onChange(fn) {
        this._themeListeners.add(fn);
        return () => this._themeListeners.delete(fn);
    }

    /** Subscribe to clock ticks, for redrawing analog hands. Returns an
     *  unsubscribe function. */
    onTick(fn) {
        this._tickListeners.add(fn);
        return () => this._tickListeners.delete(fn);
    }

    /** Call once, as early as possible after DOM is ready. */
    init() {
        const stored = this._loadStoredPreference();
        this._isExplicit = stored.isExplicit;

        if (this._isExplicit) {
            this._applyTheme(stored.theme);
        } else {
            this._applyTheme(this._isDaytimeNow() ? 'day' : 'night');
            this._resolveLocation();
        }

        this._tickIntervalId = window.setInterval(() => this._tick(), TICK_INTERVAL_MS);
        // Fire once immediately so subscribers (the clock face) get an
        // initial position without waiting a full tick interval.
        this._tick();
    }

    /**
     * Asks for geolocation and, if granted, resolves a UTC offset for
     * those coordinates so the clock/theme match the visitor's real
     * location rather than just their device's configured timezone.
     * Never blocks rendering — the device-timezone fallback is already
     * in effect the whole time this is pending.
     */
    async _resolveLocation() {
        if (!('geolocation' in navigator)) return;

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const res = await fetch(`${TIMEZONE_LOOKUP_URL}?latitude=${latitude}&longitude=${longitude}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (typeof data.currentUtcOffset?.seconds === 'number') {
                        this._locationUtcOffsetMin = data.currentUtcOffset.seconds / 60;
                        this._tick();
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

    /**
     * The switch is the only interactive control. Flipping it is an
     * explicit, persisted choice — from this point on, AM/PM auto-sync
     * no longer changes the theme (the clock face keeps ticking either
     * way; only the day/night decision is frozen).
     * @param {boolean} isDark
     */
    setDarkMode(isDark) {
        const theme = isDark ? 'night' : 'day';
        this._isExplicit = true;
        this._persistExplicitChoice(theme);
        this._applyTheme(theme);
    }
}

export const themeController = new ThemeController();
