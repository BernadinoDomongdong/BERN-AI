/**
 * chatPanel.js — owns the composer, in-flight request lifecycle, and
 * response rendering.
 */

import { i18n } from './i18n.js';
import { sendChatMessage, ApiError } from './api.js';

/**
 * @typedef {Object} ChatPanelElements
 * @property {HTMLButtonElement} askBtn
 * @property {HTMLButtonElement} stopBtn
 * @property {HTMLInputElement} userInput
 * @property {HTMLElement} response
 * @property {HTMLElement} errorNote
 * @property {HTMLElement} transit
 * @property {HTMLSelectElement} modelSelect
 */

// Mirrors MAX_MESSAGE_LENGTH in api/chat.js. Kept in sync manually since
// the two run in different runtimes; validating here too means the
// person gets instant feedback instead of waiting on a round trip just
// to be told the same thing by the server.
const MAX_MESSAGE_LENGTH = 4000;

export class ChatPanel {
    /**
     * @param {ChatPanelElements} elements
     * @param {import('./modelSelector.js').ModelSelector} modelSelector
     * @param {import('./languageSelector.js').LanguageSelector} languageSelector
     */
    constructor(elements, modelSelector, languageSelector) {
        this.el = elements;
        this.modelSelector = modelSelector;
        this.languageSelector = languageSelector;
        /** @type {AbortController|null} */
        this.activeController = null;

        this.el.askBtn.addEventListener('click', () => this.send());
        this.el.stopBtn.addEventListener('click', () => this.stop());
        this.el.userInput.addEventListener('keydown', (event) => {
            // Enter must never do anything the button itself currently
            // disallows — otherwise the two paths can drift out of sync
            // (this was the original bug: Enter worked while a stuck
            // `disabled` attribute blocked the click).
            if (event.key === 'Enter' && !this.el.askBtn.disabled) this.send();
        });

        // The model dropdown starts `disabled` in markup and is the only
        // thing that gates whether asking is possible; re-evaluate the
        // Ask button every time model readiness could have changed
        // instead of setting `.disabled` once and hoping it stays right.
        this.el.modelSelect.addEventListener('change', () => this._refreshAskAvailability());
    }

    /**
     * @param {string} message
     */
    _showError(message) {
        this.el.errorNote.textContent = message;
        this.el.errorNote.hidden = false;
    }

    _hideError() {
        this.el.errorNote.hidden = true;
    }

    /** Public entry point — call whenever model readiness could have
     *  changed (initial load finishing, locale-triggered re-render). */
    syncAskAvailability() {
        this._refreshAskAvailability();
    }

    /** Single source of truth for whether "Ask" should be clickable. */
    _refreshAskAvailability() {
        const isBusy = !this.el.transit.hidden;
        const hasModel = this.modelSelector.isReady && Boolean(this.modelSelector.selectedId);
        this.el.askBtn.disabled = isBusy || !hasModel;
    }

    /** @param {boolean} isLoading */
    _setLoading(isLoading) {
        this.el.transit.hidden = !isLoading;
        this.el.stopBtn.hidden = !isLoading;
        this.el.userInput.disabled = isLoading;
        this.el.modelSelect.disabled = isLoading;
        this._refreshAskAvailability();
    }

    /** @param {string} message */
    _showEmptyState(message) {
        this.el.response.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'ticket__empty';
        p.textContent = message;
        this.el.response.appendChild(p);
        this.el.response.classList.remove('ticket--filled');
    }

    /**
     * Validates the composer's current contents before sending.
     * @returns {{ ok: true, message: string } | { ok: false }}
     */
    _validateInput() {
        const message = this.el.userInput.value.trim();

        if (!message) {
            this._showError(i18n.t('error.emptyMessage'));
            this.el.userInput.focus();
            return { ok: false };
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            this._showError(i18n.t('error.messageTooLong'));
            this.el.userInput.focus();
            return { ok: false };
        }
        if (!this.modelSelector.isReady || !this.modelSelector.selectedId) {
            this._showError(i18n.t('error.noModel'));
            return { ok: false };
        }

        return { ok: true, message };
    }

    /**
     * Renders a successful chat completion's markdown into the response
     * ticket. Guards against a missing/failed marked.js load instead of
     * throwing, since that library is loaded from a CDN <script> tag
     * outside this module's control.
     * @param {string} markdownText
     */
    _renderReply(markdownText) {
        const canRenderMarkdown = typeof window.marked?.parse === 'function';
        this.el.response.innerHTML = canRenderMarkdown
            ? window.marked.parse(markdownText)
            : escapeHtml(markdownText);
        this.el.response.classList.add('ticket--filled');
    }

    async send() {
        this._hideError();

        const validation = this._validateInput();
        if (!validation.ok) return;

        this.el.response.innerHTML = '';
        this.el.response.classList.remove('ticket--filled');
        this._setLoading(true);

        this.activeController = new AbortController();

        try {
            const data = await sendChatMessage({
                message: validation.message,
                model: this.modelSelector.selectedId,
                language: this.languageSelector.promptLanguage,
                formToken: this.modelSelector.formToken,
                formIssuedAt: this.modelSelector.formIssuedAt,
                signal: this.activeController.signal,
            });

            const markdownText = data.choices?.[0]?.message?.content || i18n.t('error.noReply');
            this._renderReply(markdownText);
        } catch (error) {
            this._handleSendError(error);
        } finally {
            this._setLoading(false);
            this.activeController = null;
        }
    }

    /**
     * Routes a failed send() to the right empty-state + error copy,
     * distinguishing a user-initiated cancel from a client-side timeout
     * from an actual server/network failure.
     * @param {unknown} error
     */
    _handleSendError(error) {
        if (error?.name === 'AbortError') {
            this._showEmptyState(i18n.t('response.cancelled'));
            return;
        }
        if (error?.name === 'TimeoutError') {
            this._showEmptyState(i18n.t('response.empty'));
            this._showError(i18n.t('error.timeout'));
            return;
        }

        this._showEmptyState(i18n.t('response.empty'));
        const message = error instanceof ApiError ? error.message : String(error?.message || error);
        this._showError(i18n.t('error.requestFailed', message));
    }

    stop() {
        this.activeController?.abort();
    }

    /** Re-renders the idle empty-state copy after a locale switch, but only if idle. */
    refreshLocale() {
        const isIdle = !this.el.response.classList.contains('ticket--filled') && !this.activeController;
        if (isIdle) {
            this._showEmptyState(i18n.t('response.empty'));
        }
    }
}

/**
 * Minimal HTML-escaping fallback for the rare case marked.js fails to
 * load, so a raw reply is still readable instead of being interpreted
 * as HTML (which would be both broken-looking and a potential XSS
 * vector if left unescaped).
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return `<p>${div.innerHTML}</p>`;
}
