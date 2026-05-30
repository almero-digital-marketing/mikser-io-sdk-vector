// mikser-io-sdk-vector
//
// A tiny client wrapper over the mikser-io vector plugin's HTTP search
// endpoint. Designed to run in the browser and in Node 18+ — uses the
// global `fetch`. Zero dependencies.
//
// Usage:
//
//   import { createClient } from 'mikser-io-sdk-vector'
//
//   const mikser = createClient({ baseUrl: 'http://localhost:3001' })
//   const search = mikser.vector('documents')
//
//   const { results } = await search.findSimilar('how to publish a report', { limit: 5 })
//   for (const { id, distance, data } of results) {
//       console.log(distance.toFixed(3), data?.title, '→', id)
//   }

class MikserError extends Error {
    constructor(status, statusText, body, url) {
        const detail = body?.error ? ': ' + body.error : ''
        super(`mikser-io-sdk-vector ${status} ${statusText}${detail} (${url})`)
        this.name = 'MikserError'
        this.status = status
        this.body = body
    }
}

function bearer(token) {
    return token ? { authorization: `Bearer ${token}` } : {}
}

function joinUrl(base, path) {
    const normalised = base.endsWith('/') ? base.slice(0, -1) : base
    return normalised + path
}

async function jsonOrThrow(res, url) {
    if (!res.ok) {
        let body
        try { body = await res.json() } catch { /* leave undefined */ }
        throw new MikserError(res.status, res.statusText, body, url)
    }
    return res.json()
}

/**
 * @param {Object} options
 * @param {string} options.baseUrl       Origin of the mikser server (e.g. https://cms.example.com)
 * @param {string} [options.vectorPath]  vector plugin mount path; default '/vector'
 * @param {typeof fetch} [options.fetch] override the fetch implementation (default: globalThis.fetch)
 * @param {Record<string,string>} [options.headers] headers attached to every request
 */
export function createClient({
    baseUrl,
    vectorPath = '/vector',
    fetch: fetchImpl,
    headers: defaultHeaders = {},
} = {}) {
    if (!baseUrl) throw new Error('createClient: baseUrl is required')
    const doFetch = fetchImpl ?? globalThis.fetch
    if (!doFetch) {
        throw new Error('createClient: no fetch available — pass { fetch } or run on Node 18+ / a modern browser')
    }

    /** Per-store vector search client. */
    function vector(storeName, { token } = {}) {
        const url = joinUrl(baseUrl, `${vectorPath}/${storeName}`)

        /**
         * Semantic search against a vector store. Returns
         * { results: [{ id, distance, data }, ...] }. `data` is the
         * original mapped object that was embedded — render the hit
         * without a second fetch.
         */
        async function findSimilar(q, { limit = 5 } = {}) {
            const res = await doFetch(url, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...defaultHeaders,
                    ...bearer(token),
                },
                body: JSON.stringify({ q, limit }),
            })
            return jsonOrThrow(res, url)
        }

        return { findSimilar }
    }

    return { vector }
}

export { MikserError }
