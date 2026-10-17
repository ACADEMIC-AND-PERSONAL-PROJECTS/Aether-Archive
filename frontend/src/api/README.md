Typed API client, query keys and TanStack Query hooks (`ADR-004`). Base URL comes from
`VITE_API_BASE_URL` — an origin, no `/api/v1` suffix; unset means same origin. Errors map to
quiet UI states, never raw messages.

`uploadPhoto.ts` is the one XHR request: upload progress and in-flight cancellation exist only on
`XMLHttpRequest.upload`. It reuses the same `ApiError`/RFC 9457 mapping as the fetch client.
