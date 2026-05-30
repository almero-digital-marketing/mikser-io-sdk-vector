# mikser-io-sdk-vector

Client SDK for querying a [mikser-io](https://github.com/almero-digital-marketing/mikser-io) `vector` store from the browser or Node — semantic search against the content the engine has indexed.

Zero dependencies. Runs anywhere `fetch` is available (modern browsers, Node 18+, Deno, Bun, Workers).

For document queries (filter / sort / paginate / project the catalog), use [mikser-io-sdk-api](https://github.com/almero-digital-marketing/mikser-io-sdk-api). The two packages are independent — install whichever you need.

## Install

```bash
npm install mikser-io-sdk-vector
```

## Quick start

```js
import { createClient } from 'mikser-io-sdk-vector'

const mikser = createClient({ baseUrl: 'http://localhost:3001' })
const search = mikser.vector('documents')

const { results } = await search.findSimilar('how to publish a report', { limit: 5 })

for (const { id, distance, data } of results) {
    console.log(distance.toFixed(3), data?.title, '→', id)
}
```

## API

`mikser.vector(storeName, { token })` returns a per-store client. The store name matches a key in your `vector.stores` config on the server.

### `findSimilar(text, options)`

Semantic search. POSTs to `/vector/<storeName>` and returns:

```ts
{
    results: [
        { id: '/documents/en/report.md', distance: 0.4943, data: { title: '...', ... } },
        ...
    ]
}
```

- **`distance`** — cosine distance, range ~0–2; lower = closer match. Only the *ordering* is meaningful — don't compare absolute values across different queries.
- **`data`** — the original object your `map(entity)` returned on the server (e.g. `{ title, lang, summary }`). Lets you render the hit without a second fetch.

### Token-gated stores

```js
const search = mikser.vector('docs', { token: process.env.SEARCH_TOKEN })
```

If the store has a `token` configured in `vector.stores.<name>.token`, the SDK sends `Authorization: Bearer <token>` on every request. Public stores don't need a token.

## Configure

```js
const mikser = createClient({
    baseUrl:    'https://cms.example.com',
    vectorPath: '/vector',     // default — must match vector.base on the server
    headers:    { 'x-trace-id': '...' },   // attached to every request
    fetch:      myFetchImpl,   // override (default: globalThis.fetch)
})
```

## Errors

Non-2xx responses throw `MikserError`:

```js
import { MikserError } from 'mikser-io-sdk-vector'

try {
    await search.findSimilar('...')
} catch (err) {
    if (err instanceof MikserError) {
        console.error(err.status, err.body?.error)
    }
}
```

## TypeScript

Full type declarations ship with the package. Narrow `VectorResult<D>` to your own data shape:

```ts
import type { VectorEnvelope } from 'mikser-io-sdk-vector'

interface DocHit { title: string; summary?: string; lang: string }

const { results }: VectorEnvelope<DocHit> = await search.findSimilar<DocHit>('query text')
```

## Using both SDKs together

If a project needs both document queries and semantic search, install both packages and alias the factories:

```js
import { createClient as createApiClient }    from 'mikser-io-sdk-api'
import { createClient as createVectorClient } from 'mikser-io-sdk-vector'

const baseUrl = 'http://localhost:3001'
const docs   = createApiClient({ baseUrl }).entities('public')
const search = createVectorClient({ baseUrl }).vector('documents')
```

## License

MIT
