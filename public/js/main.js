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
        themeToggle: document.getElementById('themeToggle'),
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

function initThemeToggle(el) {
    themeController.init();

    const syncLabel = () => {
        const key = themeController.currentTheme === 'night' ? 'theme.toDay' : 'theme.toNight';
        el.themeToggle.setAttribute('aria-label', i18n.t(key));
        el.themeToggle.classList.toggle('theme-toggle--auto', themeController.isAuto);
    };

    syncLabel();
    themeController.onChange(syncLabel);
    i18n.onChange(syncLabel);

    el.themeToggle.addEventListener('click', () => {
        themeController.toggle();
        if (el.themeModeSwitch) el.themeModeSwitch.checked = false;
        syncLabel();
    });

    if (el.themeModeSwitch) {
        el.themeModeSwitch.checked = themeController.isAuto;
        el.themeModeSwitch.addEventListener('change', () => {
            themeController.setAuto(el.themeModeSwitch.checked);
            syncLabel();
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
