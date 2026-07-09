/**
 * languageSelector.js — owns the "answer language" dropdown.
 *
 * Selecting a language does two things at once, by design:
 *   1. sets the language the API is asked to reply in
 *   2. sets the language the *entire UI* renders in (via i18n.setLocale)
 *
 * The one exception is the signboard title ("BERN-AI"), which is a
 * brand name and never translates.
 */

import { i18n } from './i18n.js';

const CUSTOM_VALUE = 'custom';

export class LanguageSelector {
    /**
     * @param {{ select: HTMLSelectElement, customInput: HTMLInputElement }} elements
     * @param {() => void} onChange - called after the locale has changed
     */
    constructor({ select, customInput }, onChange) {
        this.select = select;
        this.customInput = customInput;
        this.onChange = onChange;

        this._populate();
        this.select.addEventListener('change', () => this._handleChange());
        this.customInput.addEventListener('input', () => this.onChange?.());
    }

    _populate() {
        this.select.innerHTML = '';
        i18n.options.forEach(({ code, label }) => {
            const el = document.createElement('option');
            el.value = code;
            el.textContent = label;
            this.select.appendChild(el);
        });

        const customOption = document.createElement('option');
        customOption.value = CUSTOM_VALUE;
        customOption.textContent = 'Other / Lain…';
        this.select.appendChild(customOption);
    }

    /** Restores the last-chosen locale (or default) and syncs UI state. */
    init() {
        const stored = i18n.loadStoredLocale();
        this.select.value = stored;
        i18n.setLocale(stored);
        this.customInput.hidden = true;
    }

    _handleChange() {
        const value = this.select.value;

        if (value === CUSTOM_VALUE) {
            this.customInput.hidden = false;
            this.customInput.focus();
            // Custom free-text language: keep UI copy in English (safest
            // default for a language we don't have strings for), but the
            // API will still be asked to answer in whatever was typed.
            i18n.setLocale('en');
        } else {
            this.customInput.hidden = true;
            i18n.setLocale(value);
        }

        i18n.persistLocale(value);
        this.onChange?.();
    }

    /** The language name to send to the API for the current selection. */
    get promptLanguage() {
        const value = this.select.value;
        if (value === CUSTOM_VALUE) {
            return this.customInput.value.trim() || 'English';
        }
        return i18n.promptNameFor(value);
    }
}
