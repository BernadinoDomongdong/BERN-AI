/**
 * main.js — composition root.
 *
 * Wires every module together. Each module owns its own slice of state
 * and DOM; this file only queries elements once and connects them.
 */

import { i18n } from './i18n.js';
import { themeController } from './theme.js';
import { CodeRain } from './codeRain.js';
import { ModelSelector } from './modelSelector.js';
import { LanguageSelector } from './languageSelector.js';
import { ChatPanel } from './chatPanel.js';

function queryElements() {
    return {
        codeRainCanvas: document.getElementById('codeRain'),
        themeClock: document.getElementById('themeClock'),
        themeModeSwitch: document.getElementById('themeModeSwitch'),
        modelSelect: document.getElementById('modelSelect'),
        modelMeta: document.getElementById('modelMeta'),
        modelCapacity: document.getElementById('modelCapacity'),
        langSelect: document.getElementById('langSelect'),
        langCustom: document.getElementById('langCustom'),
        askBtn: document.getElementById('askBtn'),
        stopBtn: document.getElementById('stopBtn'),
        userInput: document.getElementById('userInput'),
        response: document.getElementById('response'),
        errorNote: document.getElementById('errorNote'),
        transit: document.getElementById('transit'),
    };
}

/**
 * Wires the analog clock face (purely visual) and the dark-mode switch
 * (the sole interactive control) to themeController. Subscriptions are
 * set up *before* themeController.init() so its first internal tick —
 * which fires synchronously at the end of init() — reaches these
 * listeners immediately, instead of the display sitting blank/stale
 * until the first timer interval elapses.
 * @param {ReturnType<typeof queryElements>} el
 */
function initThemeToggle(el) {
    const hourHand = el.themeClock?.querySelector('.clock-hand--hour');
    const minuteHand = el.themeClock?.querySelector('.clock-hand--minute');

    /** @param {{ hour: number, minute: number }} time */
    const renderClockHands = ({ hour, minute }) => {
        if (!hourHand || !minuteHand) return;
        const minuteDeg = (minute / 60) * 360;
        const hourDeg = ((hour % 12) / 12) * 360 + (minute / 60) * 30;
        hourHand.setAttribute('transform', `rotate(${hourDeg} 12 12)`);
        minuteHand.setAttribute('transform', `rotate(${minuteDeg} 12 12)`);
    };

    const syncSwitchState = () => {
        if (!el.themeModeSwitch) return;
        el.themeModeSwitch.checked = themeController.isDark;
        // Reuses the existing "switch to X mode" copy: it describes what
        // activating the control does next, same phrasing the old
        // clickable toggle used for the same underlying action.
        const label = i18n.t(themeController.isDark ? 'theme.toDay' : 'theme.toNight');
        el.themeModeSwitch.setAttribute('aria-label', label);
    };

    themeController.onTick(renderClockHands);
    themeController.onChange(syncSwitchState);
    i18n.onChange(syncSwitchState);

    themeController.init();

    if (el.themeModeSwitch) {
        el.themeModeSwitch.addEventListener('change', () => {
            themeController.setDarkMode(el.themeModeSwitch.checked);
        });
    }
}

function initCodeRain(el) {
    if (!el.codeRainCanvas) return;
    const rain = new CodeRain(el.codeRainCanvas);
    rain.start();
}

async function init() {
    const el = queryElements();

    initThemeToggle(el);
    initCodeRain(el);

    const modelSelector = new ModelSelector({
        select: el.modelSelect,
        meta: el.modelMeta,
        capacity: el.modelCapacity,
    });

    const languageSelector = new LanguageSelector(
        { select: el.langSelect, customInput: el.langCustom },
        () => {
            i18n.applyToDocument();
            modelSelector.refreshLocale();
            chatPanel.refreshLocale();
        }
    );

    const chatPanel = new ChatPanel(el, modelSelector, languageSelector);

    languageSelector.init();
    i18n.applyToDocument();

    await modelSelector.load();
    chatPanel.syncAskAvailability();
}

document.addEventListener('DOMContentLoaded', init);
