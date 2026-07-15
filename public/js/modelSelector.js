/**
 * modelSelector.js — owns the "choose a model" dropdown.
 *
 * Responsibilities: fetch the free-model list, render it, keep the
 * capacity readout in sync with the selection, and re-render its own
 * status copy whenever the active locale changes (model *names* stay
 * as OpenRouter returns them — only the surrounding UI copy translates).
 */

import { i18n } from './i18n.js';
import { fetchModels, ApiError } from './api.js';

export class ModelSelector {
    /**
     * @param {{ select: HTMLSelectElement, meta: HTMLElement, capacity: HTMLElement }} elements
     */
    constructor({ select, meta, capacity }) {
        this.select = select;
        this.meta = meta;
        this.capacity = capacity;
        this.models = [];
        this.status = 'loading'; // 'loading' | 'ready' | 'empty' | 'error'
        this.errorMessage = '';
        // See lib/formToken.js — undefined when the server hasn't
        // configured FORM_TOKEN_SECRET, in which case chatPanel.js just
        // sends undefined and the server-side check fails open too.
        this.formToken = undefined;
        this.formIssuedAt = undefined;

        this.select.addEventListener('change', () => this._renderCapacity());
    }

    get selectedId() {
        return this.select.value;
    }

    get isReady() {
        return this.status === 'ready';
    }

    async load() {
        this.status = 'loading';
        this._render();

        try {
            const result = await fetchModels();
            this.models = result.models;
            this.formToken = result.formToken;
            this.formIssuedAt = result.formIssuedAt;
            this.status = this.models.length > 0 ? 'ready' : 'empty';
        } catch (err) {
            this.status = 'error';
            this.errorMessage = err instanceof ApiError ? err.message : String(err);
        }

        this._render();
        return this.status;
    }

    /** Re-renders all translatable copy for this component. Call on locale change. */
    refreshLocale() {
        this._render();
    }

    _render() {
        this.select.innerHTML = '';

        if (this.status === 'loading') {
            this.select.innerHTML = `<option value="">${i18n.t('field.model.loading')}</option>`;
            this.select.disabled = true;
            this.meta.textContent = '';
            this.capacity.hidden = true;
            return;
        }

        if (this.status === 'error') {
            this.select.innerHTML = `<option value="">${i18n.t('field.model.failed')}</option>`;
            this.select.disabled = true;
            this.meta.textContent = i18n.t('error.modelsFailed', this.errorMessage);
            this.capacity.hidden = true;
            return;
        }

        if (this.status === 'empty') {
            this.select.innerHTML = `<option value="">${i18n.t('field.model.none')}</option>`;
            this.select.disabled = true;
            this.meta.textContent = i18n.t('field.model.none');
            this.capacity.hidden = true;
            return;
        }

        const previouslySelected = this.select.value;
        const fragment = document.createDocumentFragment();
        this.models.forEach((model) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            fragment.appendChild(option);
        });
        this.select.appendChild(fragment);
        this.select.disabled = false;

        const stillExists = this.models.some((m) => m.id === previouslySelected);
        if (stillExists) this.select.value = previouslySelected;

        this.meta.textContent = i18n.t('field.model.ready', this.models.length);
        this._renderCapacity();
    }

    /**
     * A rough, log-scaled fill percentage for the capacity gauge bar.
     * Context windows span orders of magnitude (2K to 1M+ tokens), so a
     * linear scale would make everything below ~200K look empty; log
     * scaling keeps the bar meaningful across that whole range.
     */
    _capacityFillPercent(contextLength) {
        const MIN_TOKENS = 2_000;
        const MAX_TOKENS = 1_000_000;
        const clamped = Math.min(Math.max(contextLength, MIN_TOKENS), MAX_TOKENS);
        const t = (Math.log10(clamped) - Math.log10(MIN_TOKENS)) / (Math.log10(MAX_TOKENS) - Math.log10(MIN_TOKENS));
        return Math.round(t * 100);
    }

    _renderCapacity() {
        const label = this.capacity.querySelector('.model-capacity__label');
        const fill = this.capacity.querySelector('.capacity-gauge__fill');
        const chosen = this.models.find((m) => m.id === this.select.value);

        if (chosen && chosen.context_length) {
            label.textContent = i18n.t('field.model.capacity', chosen.context_length);
            fill.style.width = this._capacityFillPercent(chosen.context_length) + '%';
            this.capacity.hidden = false;
        } else {
            this.capacity.hidden = true;
        }
    }
}
