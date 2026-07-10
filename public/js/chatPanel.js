/**
 * chatPanel.js — owns the composer, in-flight request lifecycle, and
 * response rendering.
 */

import { i18n } from './i18n.js';
import { sendChatMessage, ApiError } from './api.js';

export class ChatPanel {
    /**
     * @param {object} elements
     * @param {ModelSelector} modelSelector
     * @param {LanguageSelector} languageSelector
     */
    constructor(elements, modelSelector, languageSelector) {
        this.el = elements;
        this.modelSelector = modelSelector;
        this.languageSelector = languageSelector;
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

    _refreshAskAvailability() {
        const isBusy = !this.el.transit.hidden;
        const hasModel = this.modelSelector.isReady && Boolean(this.modelSelector.selectedId);
        this.el.askBtn.disabled = isBusy || !hasModel;
    }

    _setLoading(isLoading) {
        this.el.transit.hidden = !isLoading;
        this.el.stopBtn.hidden = !isLoading;
        this.el.userInput.disabled = isLoading;
        this.el.modelSelect.disabled = isLoading;
        this._refreshAskAvailability();
    }

    _showEmptyState(message) {
        this.el.response.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'ticket__empty';
        p.textContent = message;
        this.el.response.appendChild(p);
        this.el.response.classList.remove('ticket--filled');
    }

    async send() {
        const message = this.el.userInput.value.trim();
        this._hideError();

        if (!message) {
            this._showError(i18n.t('error.emptyMessage'));
            this.el.userInput.focus();
            return;
        }
        if (!this.modelSelector.isReady || !this.modelSelector.selectedId) {
            this._showError(i18n.t('error.noModel'));
            return;
        }

        this.el.response.innerHTML = '';
        this.el.response.classList.remove('ticket--filled');
        this._setLoading(true);

        this.activeController = new AbortController();

        try {
            const data = await sendChatMessage({
                message,
                model: this.modelSelector.selectedId,
                language: this.languageSelector.promptLanguage,
                signal: this.activeController.signal,
            });

            const markdownText = data.choices?.[0]?.message?.content || i18n.t('error.noReply');
            this.el.response.innerHTML = window.marked.parse(markdownText);
            this.el.response.classList.add('ticket--filled');
        } catch (error) {
            if (error.name === 'AbortError') {
                this._showEmptyState(i18n.t('response.cancelled'));
            } else {
                this._showEmptyState(i18n.t('response.empty'));
                const message = error instanceof ApiError ? error.message : String(error.message || error);
                this._showError(i18n.t('error.requestFailed', message));
            }
        } finally {
            this._setLoading(false);
            this.activeController = null;
        }
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
