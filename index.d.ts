// Type declarations for mikser-io-sdk-vector.

export interface ClientOptions {
    /** Origin of the mikser server, e.g. https://cms.example.com */
    baseUrl: string
    /** vector plugin mount path (default '/vector'). */
    vectorPath?: string
    /** Override fetch (default: globalThis.fetch). */
    fetch?: typeof fetch
    /** Headers attached to every request. */
    headers?: Record<string, string>
}

export interface VectorOptions {
    /** Bearer token sent on every request to this store. */
    token?: string
}

export interface VectorResult<D = unknown> {
    id: string
    /** Cosine distance — lower is closer. Comparable across queries against the same store. */
    distance: number
    /** The original mapped object that was embedded (whatever map() returned on the server). */
    data: D | null
}

export interface VectorEnvelope<D = unknown> {
    results: VectorResult<D>[]
}

export interface VectorClient {
    /** POST /vector/:store — semantic search. */
    findSimilar<D = unknown>(q: string, options?: { limit?: number }): Promise<VectorEnvelope<D>>
}

export interface MikserVectorClient {
    vector(storeName: string, options?: VectorOptions): VectorClient
}

export declare function createClient(options: ClientOptions): MikserVectorClient

export declare class MikserError extends Error {
    name: 'MikserError'
    status: number
    body: { error?: string } | undefined
}
