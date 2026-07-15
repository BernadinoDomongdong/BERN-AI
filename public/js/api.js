/**
 * api.js — thin client for our own serverless endpoints.
 *
 * No API key ever lives in the browser. This module only ever talks to
 * /api/models and /api/chat, which hold the real OpenRouter key
 * server-side (see /api/chat.js, /api/models.js) and only ever forward
 * requests to models that are free at the moment of the request.
 */

/**
 * @typedef {Object} FreeModel
 * @property {string} id
 * @property {string} name
 * @property {number|null} context_length
 */

/**
 * @typedef {Object} FetchModelsResult
 * @property {FreeModel[]} models
 * @property {string} [formToken] - Present only if the server has
 *   FORM_TOKEN_SECRET configured; see lib/formToken.js. Must be echoed
 *   back on sendChatMessage().
 * @property {number} [formIssuedAt] - Pairs with formToken.
 */

/**
 * @typedef {Object} SendChatMessageParams
 * @property {string} message
 * @property {string} model
 * @property {string} language
 * @property {string} [formToken] - From a prior fetchModels() call.
 * @property {number} [formIssuedAt] - From a prior fetchModels() call.
 * @property {AbortSignal} [signal]
 */

const REQUEST_TIMEOUT_MS = 30 * 1000;

class ApiError extends Error {
    /**
     * @param {string} message
     * @param {number} status - HTTP status code, or 0 for network-level failures.
     */
    constructor(message, status) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * Combines a caller-provided AbortSignal (e.g. from a "Stop" button) with
 * an internal timeout, so a request is cancellable both by the user and
 * by a hung connection. Falls back to a plain timeout signal if the
 * environment lacks AbortSignal.any (older browsers).
 * @param {AbortSignal} [callerSignal]
 * @returns {AbortSignal}
 */
function withTimeout(callerSignal) {
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    if (!callerSignal) return timeoutSignal;
    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any([callerSignal, timeoutSignal]);
    }
    return callerSignal;
}

/**
 * Parses a fetch Response as JSON, tolerating a non-JSON or empty body
 * (e.g. a proxy error page) instead of throwing an unrelated SyntaxError.
 * @param {Response} response
 * @returns {Promise<Record<string, unknown>>}
 */
async function parseJsonSafely(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

/**
 * GET /api/models — the live list of currently-free OpenRouter models,
 * plus a short-lived anti-automation token (see lib/formToken.js) that
 * must be echoed back on the next sendChatMessage() call.
 * @returns {Promise<FetchModelsResult>}
 * @throws {ApiError}
 */
async function fetchModels() {
    let response;
    try {
        response = await fetch('/api/models', { signal: withTimeout() });
    } catch (err) {
        throw new ApiError(networkErrorMessage(err), 0);
    }

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new ApiError(String(data.error || `HTTP ${response.status}`), response.status);
    }
    return {
        models: Array.isArray(data.models) ? data.models : [],
        formToken: typeof data.formToken === 'string' ? data.formToken : undefined,
        formIssuedAt: typeof data.formIssuedAt === 'number' ? data.formIssuedAt : undefined,
    };
}

/**
 * POST /api/chat — send a single-turn question.
 * @param {SendChatMessageParams} params
 * @returns {Promise<unknown>} OpenRouter's chat completion response.
 * @throws {ApiError}
 */
async function sendChatMessage({ message, model, language, formToken, formIssuedAt, signal }) {
    let response;
    try {
        response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, model, language, formToken, formIssuedAt }),
            signal: withTimeout(signal),
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err; // let the caller's own cancel handling see this
        throw new ApiError(networkErrorMessage(err), 0);
    }

    const data = await parseJsonSafely(response);
    if (!response.ok) {
        throw new ApiError(String(data.error || `HTTP ${response.status}`), response.status);
    }
    return data;
}

/**
 * @param {unknown} err
 * @returns {string} A message safe to surface to the person, without leaking internals.
 */
function networkErrorMessage(err) {
    return err instanceof Error && err.message ? err.message : 'Network request failed';
}

export { fetchModels, sendChatMessage, ApiError };
