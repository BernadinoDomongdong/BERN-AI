/**
 * api.js — thin client for our own serverless endpoints.
 *
 * No API key ever lives in the browser. This module only ever talks to
 * /api/models and /api/chat, which hold the real OpenRouter key
 * server-side (see /api/chat.js, /api/models.js) and only ever forward
 * requests to models that are free at the moment of the request.
 */

class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/** GET /api/models — the live list of currently-free OpenRouter models. */
async function fetchModels() {
    const res = await fetch('/api/models');
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
    }
    return data.models || [];
}

/**
 * POST /api/chat — send a single-turn question.
 * @param {{ message: string, model: string, language: string, signal?: AbortSignal }} params
 */
async function sendChatMessage({ message, model, language, signal }) {
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model, language }),
        signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
    }
    return data;
}

export { fetchModels, sendChatMessage, ApiError };
