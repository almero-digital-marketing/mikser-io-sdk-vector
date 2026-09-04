// The client wrapper over the vector plugin's search endpoint.
//
// It is thin on purpose, so what is worth testing is the small set of
// decisions it makes on the caller's behalf — the URL it builds, the headers
// it merges, and what it does with a response that is not ok. All of those
// are silent when wrong: a doubled slash, a dropped auth header or a swallowed
// 401 all present as "no results" to the page rendering them.
//
// fetch is injected, so these are real calls against a recorded fake rather
// than a network.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createClient, MikserError } from '../index.js'

const recorder = (respond) => {
    const calls = []
    const fetch = async (url, init) => {
        calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined })
        return respond ? respond(url, init) : ok({ results: [] })
    }
    return { calls, fetch }
}
const ok = (json) => ({ ok: true, status: 200, statusText: 'OK', json: async () => json })
const fail = (status, statusText, json) => ({
    ok: false, status, statusText,
    json: async () => { if (json === undefined) throw new Error('no body'); return json },
})

describe('creating a client', () => {
    it('refuses without a baseUrl, rather than building requests to undefined', () => {
        assert.throws(() => createClient(), /baseUrl is required/)
        assert.throws(() => createClient({}), /baseUrl is required/)
    })

    it('says so when there is no fetch to use', () => {
        // An old Node, or a bundler target without a global fetch. The error
        // names both remedies, because "fetch is not a function" thrown from
        // inside an SDK tells the caller nothing.
        //
        // The global has to be removed to reach this: `fetchImpl ?? globalThis
        // .fetch` treats an explicit null as "not supplied" and falls through
        // to a global that exists on every Node this runs on.
        const real = globalThis.fetch
        try {
            delete globalThis.fetch
            assert.throws(() => createClient({ baseUrl: 'http://x' }), /no fetch available/)
        } finally {
            globalThis.fetch = real
        }
    })
})

describe('the url it builds', () => {
    it('mounts the store under the vector path', async () => {
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h:3001', fetch }).vector('documents').findSimilar('q')
        assert.equal(calls[0].url, 'http://h:3001/vector/documents')
    })

    it('does not double the slash when baseUrl has a trailing one', async () => {
        // The most common way to configure this wrong, and the failure is a
        // 404 that looks like a missing store rather than a malformed url.
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h:3001/', fetch }).vector('docs').findSimilar('q')
        assert.equal(calls[0].url, 'http://h:3001/vector/docs')
    })

    it('honours a custom mount path', async () => {
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h', vectorPath: '/api/v', fetch })
            .vector('s').findSimilar('q')
        assert.equal(calls[0].url, 'http://h/api/v/s')
    })
})

describe('what it sends', () => {
    it('posts the query and a default limit', async () => {
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h', fetch }).vector('s').findSimilar('how to publish')
        assert.equal(calls[0].init.method, 'POST')
        assert.deepEqual(calls[0].body, { q: 'how to publish', limit: 5 })
    })

    it('takes an explicit limit', async () => {
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h', fetch }).vector('s').findSimilar('q', { limit: 25 })
        assert.equal(calls[0].body.limit, 25)
    })

    it('sends the client headers, and lets a per-store token win', async () => {
        // Both are configured in different places — the client for a shared
        // api key, the store for a caller's own token. A merge order that
        // dropped the token would authenticate as the wrong principal.
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h', fetch, headers: { 'x-app': 'site', authorization: 'Bearer shared' } })
            .vector('s', { token: 'per-caller' }).findSimilar('q')
        const h = calls[0].init.headers
        assert.equal(h['content-type'], 'application/json')
        assert.equal(h['x-app'], 'site')
        assert.equal(h.authorization, 'Bearer per-caller')
    })

    it('sends no authorization at all when there is no token', async () => {
        const { calls, fetch } = recorder()
        await createClient({ baseUrl: 'http://h', fetch }).vector('s').findSimilar('q')
        assert.equal(calls[0].init.headers.authorization, undefined)
    })
})

describe('a response that is not ok', () => {
    it('throws a MikserError carrying the status', async () => {
        // Returning the body, or an empty result set, would make an expired
        // token look like a store with nothing in it.
        const { fetch } = recorder(() => fail(401, 'Unauthorized', { error: 'bad token' }))
        const search = createClient({ baseUrl: 'http://h', fetch }).vector('s')
        await assert.rejects(() => search.findSimilar('q'), (err) => {
            assert.ok(err instanceof MikserError)
            assert.equal(err.status, 401)
            assert.equal(err.body.error, 'bad token')
            assert.match(err.message, /401 Unauthorized: bad token/)
            assert.match(err.message, /http:\/\/h\/vector\/s/, 'the url belongs in the message')
            return true
        })
    })

    it('still throws when the error body is not json', async () => {
        // A proxy returning an HTML error page must not turn into a parse
        // failure that hides the status.
        const { fetch } = recorder(() => fail(502, 'Bad Gateway'))
        const search = createClient({ baseUrl: 'http://h', fetch }).vector('s')
        await assert.rejects(() => search.findSimilar('q'), (err) => {
            assert.equal(err.status, 502)
            assert.equal(err.body, undefined)
            return true
        })
    })
})

describe('a successful response', () => {
    it('comes back as the server sent it', async () => {
        const payload = { results: [{ id: '/a', distance: 0.12, data: { title: 'A' } }] }
        const { fetch } = recorder(() => ok(payload))
        const out = await createClient({ baseUrl: 'http://h', fetch }).vector('s').findSimilar('q')
        assert.deepEqual(out, payload)
    })
})
