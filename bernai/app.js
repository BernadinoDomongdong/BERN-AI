'use strict';

/**
 * BERN-AI frontend logic.
 *
 * No API key ever lives here. The browser only ever talks to our own
 * serverless functions (/api/models and /api/chat), which hold the real
 * OpenRouter key and only ever forward requests to models that are free
 * at the moment the request is made.
 *
 * File is organized as: constants -> DOM refs -> small pure helpers ->
 * one init function per feature -> a single init() that wires it all up.
 */

/* ---------------------------------------------------------------------
   Constants
   --------------------------------------------------------------------- */

const THEME_STORAGE_KEY = 'bernai-theme';
const LANGUAGE_STORAGE_KEY = 'bernai-language';
const DEFAULT_LANGUAGE_VALUE = 'en';
const MOBILE_BREAKPOINT_PX = 640;
const CODE_RAIN_COLUMNS_DESKTOP = 12;
const CODE_RAIN_COLUMNS_MOBILE = 6;
const CODE_RAIN_LINES_PER_COLUMN = 24;

/** value = sent to the <select>, promptName = sent to the API. */
const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English (Default)', promptName: 'English' },
    { value: 'ceb', label: 'Binisaya / Cebuano', promptName: 'Binisaya (Cebuano)' },
    { value: 'fil', label: 'Filipino / Tagalog', promptName: 'Filipino (Tagalog)' },
    { value: 'es', label: 'Español', promptName: 'Spanish' },
    { value: 'ja', label: '日本語', promptName: 'Japanese' },
    { value: 'ko', label: '한국어', promptName: 'Korean' },
    { value: 'zh', label: '中文', promptName: 'Chinese (Simplified)' },
    { value: 'fr', label: 'Français', promptName: 'French' },
    { value: 'de', label: 'Deutsch', promptName: 'German' },
    { value: 'ar', label: 'العربية', promptName: 'Arabic' },
    { value: 'custom', label: 'Lain nga pinulongan...', promptName: null },
];

const CODE_SNIPPETS = [
    'SELECT * FROM DWHUB.FCT_SALES',
    'npm run build',
    "git commit -m 'fix: chat flow'",
    'async function handler(req, res) {',
    'const data = await res.json();',
    'CREATE INDEX idx_item ON DWSTAGE',
    'for (let i = 0; i < n; i++) {',
    'curl -X POST /api/chat',
    'TRUNCATE TABLE DWUTIL.STG_ITEM',
    '{ "model": "free", "ok": true }',
    'export default function App() {',
    'SELECT TOP 100 * FROM DWMARTS',
    'const [state, setState] = useState()',
    'MERGE INTO DWHUB.DIM_CUSTOMER',
    'try { await fetchFreeModels() }',
    'SELECT COUNT(*) FROM DWSTAGE.STG_SALES',
];

/* ---------------------------------------------------------------------
   DOM references (queried once)
   --------------------------------------------------------------------- */

const dom = {
    codeRain: document.getElementById('codeRain'),
    themeToggle: document.getElementById('themeToggle'),
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

/** Free models fetched from /api/models, cached for capacity lookups. */
let availableModels = [];
/** AbortController for the in-flight /api/chat request, if any. */
let activeRequestController = null;

/* ---------------------------------------------------------------------
   Small helpers
   --------------------------------------------------------------------- */

function readStoredValue(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function writeStoredValue(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        // Storage can be unavailable (private browsing, disabled cookies, etc).
        // Theme/language preference just won't persist — not fatal.
    }
}

function showError(message) {
    dom.errorNote.textContent = message;
    dom.errorNote.hidden = false;
}

function hideError() {
    dom.errorNote.hidden = true;
}

/* ---------------------------------------------------------------------
   Theme (day / night)
   --------------------------------------------------------------------- */

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    dom.themeToggle.setAttribute(
        'aria-label',
        theme === 'night' ? 'Ilisi sa day mode' : 'Ilisi sa night mode'
    );
    writeStoredValue(THEME_STORAGE_KEY, theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'night';
    applyTheme(current === 'night' ? 'day' : 'night');
}

function initThemeToggle() {
    // The theme itself is already applied by the inline head script (to
    // avoid a flash of the wrong theme); here we just sync the button
    // label and wire up the click handler.
    const current = document.documentElement.getAttribute('data-theme') || 'night';
    applyTheme(current);
    dom.themeToggle.addEventListener('click', toggleTheme);
}

/* ---------------------------------------------------------------------
   Ambient code-rain background
   --------------------------------------------------------------------- */

function buildCodeColumnText() {
    const lines = [];
    for (let i = 0; i < CODE_RAIN_LINES_PER_COLUMN; i++) {
        const snippet = CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)];
        lines.push(snippet);
    }
    return lines.join('\n');
}

function initCodeRain() {
    if (!dom.codeRain) return;

    const columnCount = window.innerWidth < MOBILE_BREAKPOINT_PX
        ? CODE_RAIN_COLUMNS_MOBILE
        : CODE_RAIN_COLUMNS_DESKTOP;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < columnCount; i++) {
        const column = document.createElement('div');
        column.className = 'code-rain__col';
        column.style.left = ((i / columnCount) * 100) + '%';
        column.style.animationDuration = (18 + Math.random() * 14) + 's';
        column.style.animationDelay = '-' + (Math.random() * 18) + 's';
        column.textContent = buildCodeColumnText();
        fragment.appendChild(column);
    }

    dom.codeRain.appendChild(fragment);
}

/* ---------------------------------------------------------------------
   Language selector
   --------------------------------------------------------------------- */

function populateLanguageSelect() {
    dom.langSelect.innerHTML = '';
    LANGUAGE_OPTIONS.forEach((option) => {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        dom.langSelect.appendChild(el);
    });
}

/** Returns the human-readable language name to send to the API. */
function getSelectedLanguagePromptName() {
    const value = dom.langSelect.value;

    if (value === 'custom') {
        const custom = dom.langCustom.value.trim();
        return custom || 'English';
    }

    const match = LANGUAGE_OPTIONS.find((option) => option.value === value);
    return (match && match.promptName) || 'English';
}

function handleLanguageChange() {
    const isCustom = dom.langSelect.value === 'custom';
    dom.langCustom.hidden = !isCustom;
    if (isCustom) {
        dom.langCustom.focus();
    }
    writeStoredValue(LANGUAGE_STORAGE_KEY, dom.langSelect.value);
}

function initLanguageSelector() {
    populateLanguageSelect();

    const storedValue = readStoredValue(LANGUAGE_STORAGE_KEY);
    const isKnownValue = LANGUAGE_OPTIONS.some((option) => option.value === storedValue);
    dom.langSelect.value = isKnownValue ? storedValue : DEFAULT_LANGUAGE_VALUE;

    dom.langCustom.hidden = dom.langSelect.value !== 'custom';

    dom.langSelect.addEventListener('change', handleLanguageChange);
}

/* ---------------------------------------------------------------------
   Model selector
   --------------------------------------------------------------------- */

function updateModelCapacity() {
    const chosen = availableModels.find((m) => m.id === dom.modelSelect.value);
    if (chosen && chosen.context_length) {
        dom.modelCapacity.textContent = 'Kapasidad: ~' + chosen.context_length.toLocaleString('en-US') + ' ka tokens';
        dom.modelCapacity.hidden = false;
    } else {
        dom.modelCapacity.hidden = true;
    }
}

async function loadModels() {
    try {
        const res = await fetch('/api/models');
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || ('HTTP ' + res.status));
        }

        availableModels = data.models || [];
        dom.modelSelect.innerHTML = '';

        if (availableModels.length === 0) {
            dom.modelSelect.innerHTML = '<option value="">Walay libre nga modelo karon</option>';
            dom.modelMeta.textContent = 'Walay $0 nga modelo nga naka-lista sa OpenRouter karon. Sulayi og refresh sa ulahi.';
            return;
        }

        availableModels.forEach((m) => {
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = m.name;
            dom.modelSelect.appendChild(option);
        });

        dom.modelSelect.disabled = false;
        dom.askBtn.disabled = false;
        dom.modelMeta.textContent = availableModels.length + ' ka libre nga modelo ang andam — pilia lang imong gusto.';
        updateModelCapacity();
    } catch (error) {
        dom.modelSelect.innerHTML = '<option value="">Wala nakarga ang listahan sa modelo</option>';
        showError('Wala nakarga ang listahan sa libre nga mga modelo: ' + error.message);
    }
}

/* ---------------------------------------------------------------------
   Chat
   --------------------------------------------------------------------- */

function setLoadingState(isLoading) {
    dom.transit.hidden = !isLoading;
    dom.askBtn.disabled = isLoading;
    dom.stopBtn.hidden = !isLoading;
    dom.userInput.disabled = isLoading;
    dom.modelSelect.disabled = isLoading;
}

function resetResponseArea() {
    dom.response.innerHTML = '';
    dom.response.classList.remove('ticket--filled');
}

function showEmptyState(message) {
    dom.response.innerHTML = '<p class="ticket__empty">' + message + '</p>';
}

async function sendMessage() {
    const message = dom.userInput.value.trim();
    const model = dom.modelSelect.value;

    hideError();

    if (!message) {
        showError('Palihug pagsulat og pangutana una mag-click sa "Tubaga".');
        dom.userInput.focus();
        return;
    }
    if (!model) {
        showError('Wala pay napiling modelo — hulata una nga makumpleto ang pag-load sa listahan.');
        return;
    }

    resetResponseArea();
    setLoadingState(true);

    activeRequestController = new AbortController();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                model: model,
                language: getSelectedLanguagePromptName(),
            }),
            signal: activeRequestController.signal,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || ('HTTP ' + response.status));
        }

        const markdownText = data.choices?.[0]?.message?.content || 'Walay tubag nga nadawat.';
        dom.response.innerHTML = marked.parse(markdownText);
        dom.response.classList.add('ticket--filled');
    } catch (error) {
        if (error.name === 'AbortError') {
            showEmptyState('Gikansela ang pangutana. Sulayi og usab kung gusto.');
        } else {
            showEmptyState('Wala pay pangutana. Sige, sulayi!');
            showError('Sayop: ' + error.message);
        }
    } finally {
        setLoadingState(false);
    }
}

function stopActiveRequest() {
    if (activeRequestController) {
        activeRequestController.abort();
    }
}

function initChat() {
    dom.askBtn.addEventListener('click', sendMessage);
    dom.stopBtn.addEventListener('click', stopActiveRequest);
    dom.modelSelect.addEventListener('change', updateModelCapacity);
    dom.userInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') sendMessage();
    });
}

/* ---------------------------------------------------------------------
   Entry point
   --------------------------------------------------------------------- */

function init() {
    initThemeToggle();
    initCodeRain();
    initLanguageSelector();
    initChat();
    loadModels();
}

document.addEventListener('DOMContentLoaded', init);
